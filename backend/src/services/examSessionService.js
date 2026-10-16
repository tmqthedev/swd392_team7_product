const { assertTransition } = require('../domain/examSessionStatus');

function httpError(statusCode, code, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.code = code;
  return err;
}

// Nhom-3 config defaults applied when a field is omitted on create.
const CONFIG_DEFAULTS = {
  main_question_count: 3,
  max_follow_ups_per_question: 2,
  answer_time_limit_sec: 120,
  think_time_sec: 0,
};

// Inclusive integer ranges for each config field.
const CONFIG_RANGES = {
  main_question_count: [1, 10],
  max_follow_ups_per_question: [0, 5],
  answer_time_limit_sec: [10, 600],
  think_time_sec: [0, 300],
};

const LANGUAGES = ['VI', 'EN'];

class ExamSessionService {
  constructor({
    examSessionRepository,
    subjectRepository,
    topicRepository,
    appUserRepository,
    rubricRepository,
    questionRepository,
    ttsAdapter,
    db,
    logger = console,
  } = {}) {
    this.examSessionRepository = examSessionRepository;
    this.subjectRepository = subjectRepository;
    this.topicRepository = topicRepository;
    this.appUserRepository = appUserRepository;
    this.rubricRepository = rubricRepository;
    this.questionRepository = questionRepository;
    this.ttsAdapter = ttsAdapter;
    this.db = db;
    this.logger = logger;
  }

  // --- Subject scope (lecturer -> subject) ---------------------------------

  // ADMIN bypasses; a null subjectId skips (lenient fallback like
  // materialService / questionService); an undefined user is skipped so unit
  // fakes without a user keep working. Otherwise a LECTURER must be assigned to
  // the subject.
  async _assertSubjectInScope(user, subjectId) {
    if (!user) return;
    if (user.role === 'ADMIN') return;
    if (subjectId == null) return;
    if (!this.subjectRepository
      || typeof this.subjectRepository.listSubjectIdsForLecturer !== 'function') {
      return;
    }
    const subjectIds = (await this.subjectRepository.listSubjectIdsForLecturer(user.id)).map(Number);
    if (!subjectIds.includes(Number(subjectId))) {
      throw httpError(403, 'FORBIDDEN', 'You do not have access to this subject.');
    }
  }

  _parseId(raw, label = 'id') {
    const id = Number(raw);
    if (!Number.isInteger(id) || id <= 0) {
      throw httpError(400, 'VALIDATION_ERROR', `A valid ${label} is required.`);
    }
    return id;
  }

  // Validate and coerce the Nhom-3 config block. On create, missing fields take
  // their defaults; on update only provided fields are validated.
  _validateConfig(input = {}, { applyDefaults } = {}) {
    const out = {};
    for (const [field, [min, max]] of Object.entries(CONFIG_RANGES)) {
      const provided = input[field];
      if (provided === undefined || provided === null || provided === '') {
        if (applyDefaults) out[field] = CONFIG_DEFAULTS[field];
        continue;
      }
      const value = Number(provided);
      if (!Number.isInteger(value) || value < min || value > max) {
        throw httpError(
          400,
          'VALIDATION_ERROR',
          `${field} must be an integer between ${min} and ${max}.`,
        );
      }
      out[field] = value;
    }
    return out;
  }

  _validateLanguage(language, { required } = {}) {
    if (language === undefined || language === null || language === '') {
      if (required) {
        throw httpError(400, 'VALIDATION_ERROR', 'language is required and must be VI or EN.');
      }
      return undefined;
    }
    const upper = String(language).toUpperCase();
    if (!LANGUAGES.includes(upper)) {
      throw httpError(400, 'VALIDATION_ERROR', 'language must be one of VI, EN.');
    }
    return upper;
  }

  async _loadScopedSession(user, examSessionId) {
    const id = this._parseId(examSessionId, 'exam session id');
    const session = await this.examSessionRepository.findById(id);
    if (!session) {
      throw httpError(404, 'NOT_FOUND', 'Exam session not found.');
    }
    await this._assertSubjectInScope(user, session.subject_id == null ? null : Number(session.subject_id));
    return session;
  }

  // --- CRUD ----------------------------------------------------------------

  async createSession({
    user, subjectId, topicId, title, language, ...rest
  } = {}) {
    const parsedSubjectId = this._parseId(subjectId, 'subjectId');
    const parsedTopicId = this._parseId(topicId, 'topicId');
    const lang = this._validateLanguage(language, { required: true });
    const config = this._validateConfig(rest, { applyDefaults: true });

    const topic = await this.topicRepository.getById(parsedTopicId);
    if (!topic) {
      throw httpError(404, 'TOPIC_NOT_FOUND', 'Topic not found.');
    }
    if (topic.subject_id != null && Number(topic.subject_id) !== parsedSubjectId) {
      throw httpError(400, 'VALIDATION_ERROR', 'The topic does not belong to this subject.');
    }

    await this._assertSubjectInScope(user, parsedSubjectId);

    return this.examSessionRepository.create({
      subjectId: parsedSubjectId,
      topicId: parsedTopicId,
      title: title ?? null,
      language: lang,
      mainQuestionCount: config.main_question_count,
      maxFollowUpsPerQuestion: config.max_follow_ups_per_question,
      answerTimeLimitSec: config.answer_time_limit_sec,
      thinkTimeSec: config.think_time_sec,
      opensAt: null,
      closesAt: null,
      status: 'DRAFT',
      createdBy: user ? user.id : null,
    });
  }

  async getSession({ user, examSessionId } = {}) {
    const session = await this._loadScopedSession(user, examSessionId);
    return this.examSessionRepository.findByIdWithParticipants(session.exam_session_id);
  }

  // ADMIN sees all; a LECTURER sees sessions they created plus any in an
  // in-scope subject. The undefined-user path (unit fakes) lists everything.
  async listSessions({ user } = {}) {
    if (!user || user.role === 'ADMIN') {
      return this.examSessionRepository.list();
    }
    const own = await this.examSessionRepository.listByCreator(user.id);
    let scoped = [];
    if (this.subjectRepository
      && typeof this.subjectRepository.listSubjectIdsForLecturer === 'function') {
      const subjectIds = await this.subjectRepository.listSubjectIdsForLecturer(user.id);
      if (subjectIds.length > 0) {
        scoped = await this.examSessionRepository.listBySubjectIds(subjectIds);
      }
    }
    const byId = new Map();
    for (const row of [...own, ...scoped]) {
      byId.set(row.exam_session_id, row);
    }
    return [...byId.values()].sort((a, b) => a.exam_session_id - b.exam_session_id);
  }

  async updateSession({
    user, examSessionId, title, language, ...rest
  } = {}) {
    const session = await this._loadScopedSession(user, examSessionId);
    if (session.status !== 'DRAFT') {
      throw httpError(409, 'INVALID_STATE', 'Only DRAFT exam sessions can be edited.');
    }

    const patch = {};
    if (title !== undefined) patch.title = title;
    if (language !== undefined) {
      patch.language = this._validateLanguage(language, { required: false });
    }
    Object.assign(patch, this._validateConfig(rest, { applyDefaults: false }));

    if (Object.keys(patch).length === 0) {
      throw httpError(400, 'VALIDATION_ERROR', 'At least one field is required to update a session.');
    }

    return this.examSessionRepository.update(session.exam_session_id, patch);
  }

  // --- Roster + examiners --------------------------------------------------

  _parseCodes(codes) {
    const raw = Array.isArray(codes) ? codes.join('\n') : String(codes || '');
    const seen = new Set();
    const result = [];
    for (const token of raw.split(/[\n,]+/)) {
      const code = token.trim();
      if (code === '') continue;
      if (seen.has(code)) continue;
      seen.add(code);
      result.push(code);
    }
    return result;
  }

  // All-or-nothing: resolve every pasted code to an active STUDENT. On ANY
  // invalid row return { ok:false, errors } and write NOTHING; on success write
  // the roster and return { ok:true, students }.
  async setStudents({ user, examSessionId, codes } = {}) {
    const session = await this._loadScopedSession(user, examSessionId);

    const parsed = this._parseCodes(codes);
    const errors = [];
    const resolved = [];
    for (const code of parsed) {
      const row = await this.appUserRepository.findByCode(code);
      if (!row) {
        errors.push({ code, error: 'Unknown student code.' });
      } else if (row.role !== 'STUDENT') {
        errors.push({ code, error: 'Code does not belong to a STUDENT.' });
      } else {
        resolved.push(row);
      }
    }

    if (errors.length > 0) {
      return { ok: false, errors };
    }

    await this.examSessionRepository.setStudents(
      session.exam_session_id,
      resolved.map((r) => r.app_user_id),
    );
    return {
      ok: true,
      students: resolved.map((r) => ({ id: r.app_user_id, code: r.code })),
    };
  }

  async setExaminers({ user, examSessionId, lecturerIds } = {}) {
    const session = await this._loadScopedSession(user, examSessionId);

    const ids = Array.from(new Set((lecturerIds || []).map(Number).filter((n) => Number.isInteger(n) && n > 0)));
    for (const id of ids) {
      const row = await this.appUserRepository.findById(id);
      if (!row || row.role !== 'LECTURER') {
        throw httpError(400, 'VALIDATION_ERROR', `User ${id} is not a LECTURER.`);
      }
    }

    const saved = await this.examSessionRepository.setExaminers(session.exam_session_id, ids);
    return { ok: true, examiners: saved };
  }

  // --- Open / close --------------------------------------------------------

  async openSession({ user, examSessionId } = {}) {
    const session = await this._loadScopedSession(user, examSessionId);
    assertTransition(session.status, 'OPEN');

    const topicId = session.topic_id;
    const required = session.main_question_count ?? CONFIG_DEFAULTS.main_question_count;
    const approvedCount = await this.examSessionRepository.countApprovedQuestionsInTopic(topicId);
    if (approvedCount < required) {
      throw httpError(
        409,
        'NOT_ENOUGH_QUESTIONS',
        `Topic has ${approvedCount} APPROVED questions but ${required} are required to open.`,
      );
    }

    // Pick the main questions and resolve the rubric(s) they use so we can lock
    // them while the session is open.
    const mainQuestionIds = await this.pickMainQuestions(topicId, required);
    const rubricIds = new Set();
    for (const qid of mainQuestionIds) {
      const question = await this.questionRepository.findById(qid);
      if (question && question.rubric_id != null) {
        rubricIds.add(Number(question.rubric_id));
      }
    }

    const run = async (tx) => {
      for (const rubricId of rubricIds) {
        await this.rubricRepository.setLocked(rubricId, true, tx);
      }
      return this.examSessionRepository.setStatus(session.exam_session_id, 'OPEN');
    };

    let updated;
    if (this.db && typeof this.db.withTransaction === 'function') {
      updated = await this.db.withTransaction((tx) => run(tx));
    } else {
      updated = await run(this.db);
    }

    // Set opens_at via the allowlisted update (status already flipped above).
    const withOpenedAt = await this.examSessionRepository.update(session.exam_session_id, {
      opens_at: new Date().toISOString(),
    });

    // Pre-generate main-question audio through the mock TTS seam: one synth per
    // selected main question. No real network call (real TTS is Step 9).
    for (const qid of mainQuestionIds) {
      const question = await this.questionRepository.findById(qid);
      const text = question ? (question.content || '') : '';
      await this.ttsAdapter.synthesize({ text, language: session.language });
    }

    return withOpenedAt || updated;
  }

  async closeSession({ user, examSessionId } = {}) {
    const session = await this._loadScopedSession(user, examSessionId);
    assertTransition(session.status, 'CLOSED');
    await this.examSessionRepository.setStatus(session.exam_session_id, 'CLOSED');
    return this.examSessionRepository.update(session.exam_session_id, {
      closes_at: new Date().toISOString(),
    });
  }

  // --- Reusable main-question picker (Chon cau chinh, Steps 6-7) -----------

  // Randomly select `count` APPROVED question ids from the topic. Returns fewer
  // ids only if the topic has fewer than `count` APPROVED questions.
  async pickMainQuestions(topicId, count) {
    const ids = await this.examSessionRepository.listApprovedQuestionIdsInTopic(topicId);
    const pool = [...ids];
    // Fisher-Yates shuffle, then take the first `count`.
    for (let i = pool.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, Math.max(0, count));
  }
}

module.exports = { ExamSessionService };
