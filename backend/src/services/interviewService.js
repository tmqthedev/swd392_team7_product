// Interview engine (Step 6): runs one student's viva from start to completion.
// ENGINE ONLY: no REST routes and no Socket.IO here; Step 7 wires these public
// methods to the transport. Every public method returns ONLY the student-safe
// view (interview/studentView.js), never a DB row and never rationale.
//
// State: Postgres is the durable record and the source of truth; the DynamoDB
// SessionContext (interview/sessionContextStore.js) holds fast-moving context
// and is rebuilt from Postgres whenever it is missing. The service keeps NO
// in-memory state between calls, so any instance can continue any interview.
//
// Decision order after an answer (interview/decideNextStep.js, spec order):
//   (1) session deadline passed -> end
//   (2) empty answer            -> next main question, no follow-up
//   (3) LLM proposes a follow-up AND follow-ups remain -> ask follow-up
//   (4) otherwise               -> next main question; none left -> end
// A4: an LLM error / timeout / invalid output is retried once; a second
// failure moves on to the next main question and records processing_failure.
// No provider failure ever stops the exam.

const { pickRandom } = require('../interview/pickQuestions');
const { decideNextStep, shouldConsultLlm } = require('../interview/decideNextStep');
const { parseFollowUpDecision } = require('../interview/followUpDecision');
const { validateGrounding } = require('../interview/groundingValidator');
const {
  buildMainRationale, buildFollowUpRationale, toStringArray, criterionNames,
} = require('../interview/rationaleBuilder');
const { toStudentInterviewView, assertStudentSafe } = require('../interview/studentView');
const {
  ACTIVE_INTERVIEW_STATUSES, ACTIVE_TURN_STATUSES, END_REASONS,
} = require('../domain/interviewStatus');

const DEFAULT_SESSION_TIME_LIMIT_SEC = 1800;
const DEFAULT_MAIN_QUESTION_COUNT = 3;
const DEFAULT_ANSWER_TIME_LIMIT_SEC = 120;
const MAX_FAILURE_MESSAGE = 500;

const AUDIO_EXTENSIONS = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/wave': 'wav',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
};

function httpError(statusCode, code, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.code = code;
  return err;
}

function toMs(value) {
  if (value == null) return null;
  const t = (value instanceof Date ? value : new Date(value)).getTime();
  return Number.isNaN(t) ? null : t;
}

function audioExtension(contentType) {
  if (!contentType) return 'webm';
  const base = String(contentType).split(';')[0].trim().toLowerCase();
  return AUDIO_EXTENSIONS[base] || 'bin';
}

function clampConfidence(value) {
  if (value == null) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.min(1, Math.max(0, n));
}

function buildTranscriptText(turns) {
  return turns
    .map((t) => `[${t.turn_type} ${t.sequence_no}] Q: ${t.question_text ?? ''}\nA: ${t.answer_text ?? ''}`)
    .join('\n\n');
}

// Reject when `promise` does not settle within `ms`. The timer is always
// cleared so a hung provider never keeps the process alive.
function withTimeout(promise, ms) {
  if (!Number.isFinite(ms) || ms <= 0) return promise;
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(httpError(504, 'LLM_TIMEOUT', `LLM call exceeded ${ms} ms.`)), ms);
    if (timer && typeof timer.unref === 'function') timer.unref();
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

class InterviewService {
  constructor({
    db,
    examSessionRepository,
    vivaInterviewRepository,
    assignedQuestionRepository,
    qaTurnRepository,
    transcriptRepository,
    processingFailureRepository,
    vivaResultRepository,
    questionRepository,
    questionSourceRefRepository,
    rubricRepository,
    sessionContextStore,
    sttAdapter,
    ttsAdapter,
    llmAdapter,
    awsClients,
    enqueueJob,
    env = {},
    clock = () => new Date(),
    random = Math.random,
    logger = console,
  } = {}) {
    this.db = db;
    this.examSessionRepository = examSessionRepository;
    this.vivaInterviewRepository = vivaInterviewRepository;
    this.assignedQuestionRepository = assignedQuestionRepository;
    this.qaTurnRepository = qaTurnRepository;
    this.transcriptRepository = transcriptRepository;
    this.processingFailureRepository = processingFailureRepository;
    this.vivaResultRepository = vivaResultRepository;
    this.questionRepository = questionRepository;
    this.questionSourceRefRepository = questionSourceRefRepository;
    this.rubricRepository = rubricRepository;
    this.sessionContextStore = sessionContextStore;
    this.sttAdapter = sttAdapter;
    this.ttsAdapter = ttsAdapter;
    this.llmAdapter = llmAdapter;
    this.awsClients = awsClients;
    this.enqueueJob = enqueueJob;
    this.env = env;
    this.clock = clock;
    this.random = random;
    this.logger = logger;
  }

  // =========================================================================
  // Public, student-facing API (Step 7 calls these from Socket.IO / REST).
  // =========================================================================

  // Start the student's interview for an exam, or resume the existing one.
  // A student never gets a second attempt: a COMPLETED interview returns its
  // ended view.
  async startOrResume({ user, examSessionId, clientIp } = {}) {
    this._assertStudent(user);
    const examId = this._parseId(examSessionId, 'exam session id');
    const exam = await this.examSessionRepository.findById(examId);
    if (!exam) throw httpError(404, 'EXAM_SESSION_NOT_FOUND', 'Exam session not found.');

    const existing = await this.vivaInterviewRepository.findByExamAndStudent(examId, user.id);
    if (existing) return this._resume(existing, exam);

    if (exam.status !== 'OPEN') {
      throw httpError(409, 'EXAM_NOT_OPEN', 'This exam session is not open.');
    }
    const onRoster = await this.examSessionRepository.isStudentOnRoster(examId, user.id);
    if (!onRoster) {
      throw httpError(403, 'NOT_ON_ROSTER', 'You are not on the roster for this exam session.');
    }

    const startedAt = this.clock();
    const deadlineAt = this._computeDeadline(startedAt, exam);
    if (deadlineAt.getTime() <= startedAt.getTime()) {
      throw httpError(409, 'EXAM_CLOSED', 'This exam session has already closed.');
    }

    // Per-student random pick from ALL APPROVED questions of the topic.
    const required = Number(exam.main_question_count) || DEFAULT_MAIN_QUESTION_COUNT;
    const approvedIds = await this.examSessionRepository.listApprovedQuestionIdsInTopic(exam.topic_id);
    if (approvedIds.length < required) {
      throw httpError(
        409,
        'NOT_ENOUGH_QUESTIONS',
        `Topic has ${approvedIds.length} APPROVED questions but ${required} are required.`,
      );
    }
    const pickedIds = pickRandom(approvedIds, required, this.random);
    const questions = [];
    for (const qid of pickedIds) {
      // eslint-disable-next-line no-await-in-loop
      questions.push(await this.questionRepository.findById(qid));
    }
    const rubricIds = [...new Set(questions
      .map((q) => (q && q.rubric_id != null ? Number(q.rubric_id) : null))
      .filter((id) => id != null))];

    // Provider work (rationale sources, TTS) happens outside the transaction.
    const first = await this._prepareMainTurn(questions[0], exam);

    let created;
    try {
      created = await this._run(async (tx) => {
        const interview = await this.vivaInterviewRepository.create({
          examSessionId: examId,
          studentId: user.id,
          status: 'IN_PROGRESS',
          startedAt,
          deadlineAt,
          clientIp: clientIp ?? null,
        }, tx);
        const interviewId = interview.viva_interview_id;
        const assigned = await this.assignedQuestionRepository.createMany(interviewId, pickedIds, tx);
        // Lock the rubric of every assigned question (idempotent) so it cannot
        // change while this student is being examined on it.
        for (const rubricId of rubricIds) {
          // eslint-disable-next-line no-await-in-loop
          await this.rubricRepository.setLocked(rubricId, true, tx);
        }
        const turn = await this.qaTurnRepository.create({
          interviewId,
          assignedQuestionId: assigned[0].assigned_question_id,
          sequenceNo: 1,
          turnType: 'MAIN',
          questionText: first.question.content,
          rationale: first.rationale,
          status: 'ASKED',
          questionAudioKey: first.audioKey,
          askedAt: startedAt,
        }, tx);
        await this.assignedQuestionRepository.markAsked(assigned[0].assigned_question_id, tx);
        return { interview, assigned, turn };
      });
    } catch (err) {
      // A concurrent start for the same student won the unique key: resume it.
      if (err && err.code === '23505') {
        const winner = await this.vivaInterviewRepository.findByExamAndStudent(examId, user.id);
        if (winner) return this._resume(winner, exam);
      }
      throw err;
    }

    const { interview, assigned, turn } = created;
    if (first.ttsError) {
      await this._recordFailure({
        interviewId: interview.viva_interview_id, turnId: turn.qa_turn_id, stage: 'TTS', error: first.ttsError,
      });
    }
    await this._safeContext(() => this.sessionContextStore.put({
      ...this._contextFromRows(interview, turn),
      coveredKeyPoints: {},
      partialSegments: [],
    }));
    return this._buildView(interview, exam, { currentTurn: turn, totalQuestions: assigned.length });
  }

  async getCurrentState({ user, interviewId } = {}) {
    const { interview, exam } = await this._loadOwned(user, interviewId);
    return this._resume(interview, exam);
  }

  // The student's client finished playing the question audio: open the answer
  // window. Replaying never extends it (the stored deadline is kept).
  async markQuestionPlayed({ user, interviewId, turnId } = {}) {
    const owned = await this._loadOwned(user, interviewId);
    const { exam } = owned;
    const interview = await this._enforceDeadline(owned.interview, exam);
    if (!this._isActive(interview)) return this._buildView(interview, exam);

    const turn = await this._requireCurrentTurn(interview, turnId);
    if (turn.status === 'ANSWERING') return this._buildView(interview, exam, { currentTurn: turn });
    if (turn.status !== 'ASKED') {
      throw httpError(409, 'TURN_NOT_ACTIVE', 'This question is no longer awaiting an answer.');
    }

    const playedAt = this.clock();
    const windowSec = (Number(exam.think_time_sec) || 0)
      + (Number(exam.answer_time_limit_sec) || DEFAULT_ANSWER_TIME_LIMIT_SEC);
    const answerDeadlineMs = Math.min(
      playedAt.getTime() + windowSec * 1000,
      toMs(interview.deadline_at),
    );
    const answerDeadlineAt = new Date(answerDeadlineMs);
    const updated = await this.qaTurnRepository.transitionStatus(
      turn.qa_turn_id,
      ['ASKED'],
      'ANSWERING',
      { played_at: playedAt, answer_deadline_at: answerDeadlineAt },
    );
    const current = updated || await this.qaTurnRepository.findById(turn.qa_turn_id);
    if (updated) {
      await this._ensureContext(interview, current);
      await this._safeContext(() => this.sessionContextStore.update(interview.viva_interview_id, {
        currentTurnId: current.qa_turn_id,
        answerDeadlineAt: answerDeadlineAt.toISOString(),
      }));
    }
    return this._buildView(interview, exam, { currentTurn: current });
  }

  // Live partial transcript from the client (Step 7 streams these). Stored in
  // the SessionContext only; nothing is echoed back.
  async appendPartialTranscript({
    user, interviewId, turnId, text, confidence,
  } = {}) {
    const owned = await this._loadOwned(user, interviewId);
    const interview = await this._enforceDeadline(owned.interview, owned.exam);
    if (!this._isActive(interview)) return assertStudentSafe({ accepted: false });
    const turn = await this._requireCurrentTurn(interview, turnId);
    if (!ACTIVE_TURN_STATUSES.includes(turn.status)) return assertStudentSafe({ accepted: false });
    await this._ensureContext(interview, turn);
    const segment = await this._safeContext(() => this.sessionContextStore.appendPartialSegment(
      interview.viva_interview_id,
      { turnId: turn.qa_turn_id, text, confidence },
    ));
    return assertStudentSafe({ accepted: !!segment });
  }

  // Submit the answer to the current turn: audio (stored to S3 then STT),
  // a client transcript, or, when neither is given, the partial segments
  // collected so far. Then apply the decision order.
  async submitAnswer({
    user, interviewId, turnId, audio, contentType, transcript, timedOut = false,
  } = {}) {
    const { interview, exam } = await this._loadOwned(user, interviewId);
    // Already ended (e.g. lazily at the deadline): nothing is accepted.
    if (!this._isActive(interview)) return this._buildView(interview, exam);
    const id = interview.viva_interview_id;

    const latest = await this._requireCurrentTurn(interview, turnId);
    const prevStatus = latest.status;
    // Atomic claim: a second submit for the same turn loses here.
    const claimed = await this.qaTurnRepository.transitionStatus(
      latest.qa_turn_id,
      ACTIVE_TURN_STATUSES,
      'PROCESSING',
    );
    if (!claimed) {
      throw httpError(409, 'TURN_NOT_ACTIVE', 'This question has already been answered.');
    }
    const receivedAt = this.clock();

    const ctx = await this._ensureContext(interview, claimed);
    const assigned = await this.assignedQuestionRepository.listByInterview(id);
    const assignedRow = assigned.find(
      (a) => String(a.assigned_question_id) === String(claimed.assigned_question_id),
    );
    const question = assignedRow ? await this.questionRepository.findById(assignedRow.question_id) : null;
    const keyPoints = toStringArray(question && question.key_points);

    // --- Resolve the answer text -------------------------------------------
    let answerAudioKey = null;
    let stt;
    if (audio) {
      const key = `interviews/${id}/turns/${claimed.qa_turn_id}/answer.${audioExtension(contentType)}`;
      try {
        await this.awsClients.putObject({
          bucket: this.env.audioBucket, key, body: audio, contentType,
        });
        answerAudioKey = key;
      } catch (err) {
        // Keep going on the in-memory buffer; the audio copy is lost, not the answer.
        await this._recordFailure({
          interviewId: id, turnId: claimed.qa_turn_id, stage: 'AUDIO_STORE', error: err,
        });
      }
      try {
        stt = await this.sttAdapter.transcribe({
          audio, contentType, language: exam.language, hints: keyPoints,
        });
      } catch (err) {
        await this._recordFailure({
          interviewId: id, turnId: claimed.qa_turn_id, stage: 'STT', error: err,
        });
        // Give the turn back so the client can resubmit (retryable).
        await this.qaTurnRepository.transitionStatus(claimed.qa_turn_id, ['PROCESSING'], prevStatus);
        throw httpError(502, 'STT_FAILED', 'Speech recognition failed. Please submit the answer again.');
      }
    } else if (transcript && transcript.text != null) {
      stt = {
        text: String(transcript.text),
        confidence: transcript.confidence ?? null,
        words: Array.isArray(transcript.words) ? transcript.words : [],
      };
    } else {
      const segments = (ctx && Array.isArray(ctx.partialSegments) ? ctx.partialSegments : [])
        .filter((s) => String(s.turnId) === String(claimed.qa_turn_id))
        .sort((a, b) => (Number(a.seq) || 0) - (Number(b.seq) || 0));
      stt = { text: segments.map((s) => s.text).join(' '), confidence: null, words: [] };
    }
    const answerText = String((stt && stt.text) ?? '').trim();

    // Server-enforced answer window: late answers are accepted ("tự nộp phần
    // đã nói") but flagged timed_out.
    const answerDeadlineMs = toMs(claimed.answer_deadline_at);
    const timedOutFinal = timedOut === true
      || (answerDeadlineMs != null && receivedAt.getTime() >= answerDeadlineMs);

    await this.qaTurnRepository.update(claimed.qa_turn_id, {
      status: 'ANSWERED',
      answer_text: answerText,
      answer_audio_key: answerAudioKey,
      transcript_confidence: clampConfidence(stt && stt.confidence),
      answer_ended_at: receivedAt,
      timed_out: timedOutFinal,
    });
    await this._safeContext(() => this.sessionContextStore.clearPartialSegments(id));

    // --- Decision ------------------------------------------------------------
    const followUpsUsed = Number(interview.current_follow_up_count) || 0;
    const maxFollowUps = Number(exam.max_follow_ups_per_question) || 0;
    const deadlineMs = toMs(interview.deadline_at);
    const turns = await this.qaTurnRepository.listByInterview(id);
    const material = await this._loadQuestionMaterial(question);

    let llmDecision;
    if (receivedAt.getTime() < deadlineMs
      && shouldConsultLlm({ answerText, followUpsUsed, maxFollowUps })) {
      llmDecision = await this._decideWithRetry({
        input: {
          language: exam.language,
          mainQuestion: {
            text: question ? question.content : '',
            bloomLevel: question ? question.bloom_level ?? null : null,
            referenceAnswer: question ? question.reference_answer ?? null : null,
            keyPoints,
          },
          rubricCriteria: criterionNames(material.rubric),
          sourceChunks: material.sourceChunks,
          history: turns
            .filter((t) => String(t.assigned_question_id) === String(claimed.assigned_question_id))
            .map((t) => ({ turnType: t.turn_type, questionText: t.question_text, answerText: t.answer_text })),
          followUpsUsed,
          maxFollowUps,
        },
        parseContext: { referenceAnswer: question ? question.reference_answer : null, keyPoints },
        interviewId: id,
        turnId: claimed.qa_turn_id,
      });
    }

    // Re-read the clock: LLM latency must not push a follow-up past the deadline.
    const step = decideNextStep({
      now: this.clock(),
      deadlineAt: interview.deadline_at,
      answerText,
      followUpsUsed,
      maxFollowUps,
      llmDecision,
    });

    const coveredKeyPoints = { ...((ctx && ctx.coveredKeyPoints) || {}) };
    if (llmDecision) {
      const aqKey = String(claimed.assigned_question_id);
      coveredKeyPoints[aqKey] = [...new Set([
        ...(coveredKeyPoints[aqKey] || []),
        ...llmDecision.covered_key_points,
      ])];
    }

    let current = interview;
    let currentTurn = null;
    if (step.action === 'END_SESSION') {
      current = await this._endInterview(interview, END_REASONS.DEADLINE_REACHED);
    } else if (step.action === 'ASK_FOLLOW_UP') {
      const transcriptSoFar = turns.map((t) => t.answer_text || '').join('\n');
      const groundingResult = validateGrounding(llmDecision.rationale.grounding, {
        transcriptSoFar, keyPoints, sourceChunks: material.sourceChunks,
      });
      const rationale = buildFollowUpRationale({ decision: llmDecision, groundingResult, now: this.clock() });
      const tts = await this._synthesize(llmDecision.follow_up_question, exam.language);
      const result = await this._run(async (tx) => {
        const turn = await this.qaTurnRepository.create({
          interviewId: id,
          assignedQuestionId: claimed.assigned_question_id,
          sequenceNo: (Number(claimed.sequence_no) || 0) + 1,
          turnType: 'FOLLOW_UP',
          followUpReason: llmDecision.follow_up_reason,
          questionText: llmDecision.follow_up_question,
          rationale,
          status: 'ASKED',
          questionAudioKey: tts.audioKey,
          askedAt: this.clock(),
        }, tx);
        const updated = await this.vivaInterviewRepository.updateProgress(id, {
          current_follow_up_count: followUpsUsed + 1,
        }, tx);
        return { turn, updated };
      });
      current = result.updated;
      currentTurn = result.turn;
      if (tts.ttsError) {
        await this._recordFailure({
          interviewId: id, turnId: currentTurn.qa_turn_id, stage: 'TTS', error: tts.ttsError,
        });
      }
    } else {
      const index = Number(interview.current_question_index) || 0;
      const next = assigned.find((a) => Number(a.order_no) === index + 2);
      if (!next) {
        current = await this._endInterview(interview, END_REASONS.QUESTIONS_EXHAUSTED);
      } else {
        const nextQuestion = await this.questionRepository.findById(next.question_id);
        const prepared = await this._prepareMainTurn(nextQuestion, exam);
        const result = await this._run(async (tx) => {
          const turn = await this.qaTurnRepository.create({
            interviewId: id,
            assignedQuestionId: next.assigned_question_id,
            sequenceNo: (Number(claimed.sequence_no) || 0) + 1,
            turnType: 'MAIN',
            questionText: prepared.question.content,
            rationale: prepared.rationale,
            status: 'ASKED',
            questionAudioKey: prepared.audioKey,
            askedAt: this.clock(),
          }, tx);
          await this.assignedQuestionRepository.markAsked(next.assigned_question_id, tx);
          const updated = await this.vivaInterviewRepository.updateProgress(id, {
            current_question_index: index + 1,
            current_follow_up_count: 0,
          }, tx);
          return { turn, updated };
        });
        current = result.updated;
        currentTurn = result.turn;
        if (prepared.ttsError) {
          await this._recordFailure({
            interviewId: id, turnId: currentTurn.qa_turn_id, stage: 'TTS', error: prepared.ttsError,
          });
        }
      }
    }

    if (this._isActive(current)) {
      await this._safeContext(() => this.sessionContextStore.update(id, {
        ...this._contextFromRows(current, currentTurn),
        coveredKeyPoints,
        partialSegments: [],
      }));
    } else {
      await this._safeContext(() => this.sessionContextStore.update(id, { coveredKeyPoints }));
    }
    return this._buildView(current, exam, { currentTurn, totalQuestions: assigned.length });
  }

  // =========================================================================
  // Internals (no instance state besides injected dependencies).
  // =========================================================================

  async _run(fn) {
    if (this.db && typeof this.db.withTransaction === 'function') {
      return this.db.withTransaction((tx) => fn(tx));
    }
    return fn(this.db || undefined);
  }

  _assertStudent(user) {
    if (!user) throw httpError(401, 'UNAUTHENTICATED', 'Authentication required.');
    if (user.role !== 'STUDENT') {
      throw httpError(403, 'FORBIDDEN', 'Only students can take an interview.');
    }
  }

  _parseId(raw, label) {
    const id = Number(raw);
    if (!Number.isInteger(id) || id <= 0) {
      throw httpError(400, 'VALIDATION_ERROR', `A valid ${label} is required.`);
    }
    return id;
  }

  // Owner check: someone else's interview is reported as not found so its
  // existence is not leaked.
  async _loadOwned(user, interviewId) {
    this._assertStudent(user);
    const id = this._parseId(interviewId, 'interview id');
    const interview = await this.vivaInterviewRepository.findById(id);
    if (!interview || Number(interview.student_id) !== Number(user.id)) {
      throw httpError(404, 'INTERVIEW_NOT_FOUND', 'Interview not found.');
    }
    const exam = await this.examSessionRepository.findById(interview.exam_session_id);
    return { interview, exam };
  }

  _isActive(interview) {
    return !!interview && ACTIVE_INTERVIEW_STATUSES.includes(interview.status);
  }

  // deadline_at = started_at + session_time_limit_sec, capped at closes_at
  // when that is set and earlier. Computed once at start and persisted.
  _computeDeadline(startedAt, exam) {
    const limitSec = Number(exam.session_time_limit_sec) || DEFAULT_SESSION_TIME_LIMIT_SEC;
    let deadlineMs = startedAt.getTime() + limitSec * 1000;
    const closesMs = toMs(exam.closes_at);
    if (closesMs != null && closesMs < deadlineMs) deadlineMs = closesMs;
    return new Date(deadlineMs);
  }

  async _resume(interview, exam) {
    const current = await this._enforceDeadline(interview, exam);
    if (this._isActive(current)) await this._ensureContext(current);
    return this._buildView(current, exam);
  }

  // Decision (1) applied lazily: an active interview past its deadline ends
  // now (Step 7 adds timers so this also fires without a client call).
  // submitAnswer deliberately does NOT call this before persisting: the
  // in-flight answer is saved first ("tự nộp phần đã nói") and decision (1)
  // then ends the interview.
  async _enforceDeadline(interview) {
    if (!this._isActive(interview)) return interview;
    if (this.clock().getTime() < toMs(interview.deadline_at)) return interview;
    return this._endInterview(interview, END_REASONS.DEADLINE_REACHED);
  }

  async _requireCurrentTurn(interview, turnId) {
    const latest = await this.qaTurnRepository.findLatestByInterview(interview.viva_interview_id);
    if (!latest || String(latest.qa_turn_id) !== String(turnId)) {
      throw httpError(409, 'TURN_NOT_CURRENT', 'This is not the current question.');
    }
    return latest;
  }

  // Idempotent completion (A6 minimal). Conditional COMPLETED flip, then in
  // the same transaction: open turns -> UNANSWERED, transcript persisted as
  // complete, viva_result PENDING created if absent. After commit the grading
  // job is enqueued (Step 8 implements GRADE_INTERVIEW).
  async _endInterview(interview, reason) {
    const id = interview.viva_interview_id;
    const endedAt = this.clock();
    const ended = await this._run(async (tx) => {
      const done = await this.vivaInterviewRepository.completeIfActive(id, { endedAt, endReason: reason }, tx);
      if (!done) return null;
      await this.qaTurnRepository.markOpenTurnsUnanswered(id, tx);
      const turns = await this.qaTurnRepository.listByInterview(id, tx);
      await this.transcriptRepository.upsert({
        interviewId: id, fullText: buildTranscriptText(turns), isComplete: true,
      }, tx);
      await this.vivaResultRepository.createPendingIfAbsent(id, tx);
      return done;
    });
    if (!ended) {
      // Someone else ended it first: no duplicate side effects.
      return this.vivaInterviewRepository.findById(id);
    }
    try {
      await this.enqueueJob('GRADE_INTERVIEW', { interviewId: id });
    } catch (err) {
      await this._recordFailure({ interviewId: id, stage: 'GRADE_ENQUEUE', error: err });
    }
    await this._safeContext(() => this.sessionContextStore.update(id, {
      status: ended.status,
      currentTurnId: null,
      answerDeadlineAt: null,
      partialSegments: [],
    }));
    return ended;
  }

  // Load question rationale sources and rubric for a main turn, and synthesize
  // its audio. Runs outside any transaction; TTS failure is reported back so
  // the caller can record it once the turn id exists.
  async _prepareMainTurn(question, exam) {
    const material = await this._loadQuestionMaterial(question);
    const rationale = buildMainRationale({
      question, sourceRefs: material.sourceRefs, rubric: material.rubric, now: this.clock(),
    });
    const tts = await this._synthesize(question ? question.content : '', exam.language);
    return {
      question, rationale, audioKey: tts.audioKey, ttsError: tts.ttsError,
    };
  }

  async _loadQuestionMaterial(question) {
    let sourceRefs = [];
    if (question && question.source === 'AI' && this.questionSourceRefRepository) {
      sourceRefs = await this.questionSourceRefRepository.listByQuestionWithMaterial(question.question_id);
    }
    const rubric = question && question.rubric_id != null && this.rubricRepository
      ? await this.rubricRepository.findById(question.rubric_id)
      : null;
    return {
      sourceRefs,
      rubric,
      sourceChunks: sourceRefs.map((s) => ({ chunkId: s.chunkId, location: s.location, content: s.content })),
    };
  }

  async _synthesize(text, language) {
    try {
      const result = await this.ttsAdapter.synthesize({ text, language });
      return { audioKey: (result && result.audioKey) || null, ttsError: null };
    } catch (err) {
      return { audioKey: null, ttsError: err };
    }
  }

  // Up to two attempts (each bounded by FOLLOW_UP_LLM_TIMEOUT_MS). Both failing
  // records one processing_failure and returns null (-> next main question).
  async _decideWithRetry({
    input, parseContext, interviewId, turnId,
  }) {
    let errorCode = null;
    let message = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const raw = await withTimeout(
          Promise.resolve().then(() => this.llmAdapter.decideFollowUp(input)),
          Number(this.env.followUpLlmTimeoutMs) || 15000,
        );
        const parsed = parseFollowUpDecision(raw, parseContext);
        if (parsed.ok) return parsed.value;
        errorCode = parsed.errorCode;
        message = parsed.message;
      } catch (err) {
        errorCode = 'LLM_ERROR';
        message = err && err.message ? err.message : String(err);
      }
    }
    await this._recordFailure({
      interviewId, turnId, stage: 'FOLLOW_UP_LLM', errorCode, message, retryCount: 1,
    });
    return null;
  }

  async _recordFailure({
    interviewId, turnId = null, stage, error, errorCode, message, retryCount = 0,
  }) {
    try {
      await this.processingFailureRepository.create({
        interviewId,
        turnId,
        stage,
        errorCode: errorCode || (error && error.code) || `${stage}_FAILED`,
        message: String(message ?? (error && error.message) ?? '').slice(0, MAX_FAILURE_MESSAGE),
        retryCount,
      });
    } catch (err) {
      this.logger.error({ err, interviewId, stage }, 'could not record processing_failure');
    }
    if (this.logger && this.logger.warn) {
      this.logger.warn({ interviewId, turnId, stage, errorCode }, 'interview processing failure recorded');
    }
  }

  _contextFromRows(interview, turn) {
    return {
      interviewId: interview.viva_interview_id,
      examSessionId: interview.exam_session_id,
      studentId: interview.student_id,
      status: interview.status,
      currentTurnId: turn ? turn.qa_turn_id : null,
      currentAssignedQuestionId: turn ? turn.assigned_question_id : null,
      currentQuestionIndex: Number(interview.current_question_index) || 0,
      currentFollowUpCount: Number(interview.current_follow_up_count) || 0,
      deadlineAt: new Date(toMs(interview.deadline_at)).toISOString(),
      answerDeadlineAt: turn && turn.answer_deadline_at
        ? new Date(toMs(turn.answer_deadline_at)).toISOString()
        : null,
    };
  }

  // Return the SessionContext, rebuilding it from Postgres when missing or
  // expired. Context failures never break the interview (Postgres is truth).
  async _ensureContext(interview, knownTurn) {
    return this._safeContext(async () => {
      const existing = await this.sessionContextStore.get(interview.viva_interview_id);
      if (existing) return existing;
      const turn = knownTurn
        || await this.qaTurnRepository.findLatestByInterview(interview.viva_interview_id);
      return this.sessionContextStore.put({
        ...this._contextFromRows(interview, turn),
        coveredKeyPoints: {},
        partialSegments: [],
      });
    });
  }

  async _safeContext(fn) {
    if (!this.sessionContextStore) return null;
    try {
      return await fn();
    } catch (err) {
      if (this.logger && this.logger.warn) {
        this.logger.warn({ err }, 'session context write/read failed (Postgres remains the source of truth)');
      }
      return null;
    }
  }

  async _buildView(interview, exam, { currentTurn, totalQuestions } = {}) {
    const turn = currentTurn !== undefined && currentTurn !== null
      ? currentTurn
      : await this.qaTurnRepository.findLatestByInterview(interview.viva_interview_id);
    const total = totalQuestions != null
      ? totalQuestions
      : (await this.assignedQuestionRepository.listByInterview(interview.viva_interview_id)).length;
    const view = toStudentInterviewView({
      interview, examSession: exam, currentTurn: turn, totalQuestions: total, now: this.clock(),
    });
    return assertStudentSafe(view);
  }
}

module.exports = { InterviewService, audioExtension, withTimeout };
