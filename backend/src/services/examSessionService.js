const { assertTransition, STATUSES } = require('../domain/examSessionStatus');
const { SubjectScope } = require('./subjectScope');
const { pickRandom } = require('../interview/pickQuestions');
const {
  computeBloomQuota, countByLevel, BLOOM_ORDER,
} = require('../interview/pickBalancedQuestions');

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
  // Lecturer-set total interview time (Step 6). 30 min covers the Nhom-3
  // default (3 main x up to 3 turns x 120 s) plus think/TTS slack.
  session_time_limit_sec: 1800,
};

// Inclusive integer ranges for each config field.
const CONFIG_RANGES = {
  main_question_count: [1, 10],
  max_follow_ups_per_question: [0, 5],
  answer_time_limit_sec: [10, 600],
  think_time_sec: [0, 300],
  session_time_limit_sec: [60, 14400],
};

const LANGUAGES = ['VI', 'EN'];

// Per-candidate cap on follow-ups across the whole interview (NULL = no cap).
const MAX_FOLLOW_UPS_TOTAL_RANGE = [0, 20];

// The admin schedule hides lecturer drafts unless asked for explicitly.
const DEFAULT_SCHEDULE_STATUSES = ['SCHEDULED', 'OPEN', 'CLOSED'];

function toMs(value) {
  if (value == null) return null;
  const t = (value instanceof Date ? value : new Date(value)).getTime();
  return Number.isNaN(t) ? null : t;
}

class ExamSessionService {
  constructor({
    examSessionRepository,
    subjectScope,
    subjectRepository,
    topicRepository,
    appUserRepository,
    rubricRepository,
    questionRepository,
    ttsAdapter,
    examLaunchService,
    db,
    clock = () => new Date(),
    logger = console,
    random = Math.random,
  } = {}) {
    this.examSessionRepository = examSessionRepository;
    this.random = random;
    this.clock = clock;
    this.examLaunchService = examLaunchService;
    this.subjectRepository = subjectRepository;
    // Reuse the shared SubjectScope helper for lecturer->subject enforcement.
    // app.js always injects one; callers that pass only a subjectRepository
    // (e.g. unit fakes) get an equivalent instance built here so the scope
    // logic lives in exactly one place.
    this.subjectScope = subjectScope
      || (subjectRepository ? new SubjectScope({ subjectRepository }) : null);
    this.topicRepository = topicRepository;
    this.appUserRepository = appUserRepository;
    this.rubricRepository = rubricRepository;
    this.questionRepository = questionRepository;
    this.ttsAdapter = ttsAdapter;
    this.db = db;
    this.logger = logger;
  }

  // --- Subject scope (lecturer -> subject) ---------------------------------

  // Delegate to the shared SubjectScope helper: ADMIN (and an undefined user)
  // is unrestricted, a null subjectId is unscoped, otherwise a LECTURER must be
  // assigned to the subject. Throws 403 FORBIDDEN when the subject is out of
  // scope. A missing helper (no subjectRepository wired) is lenient.
  async _assertSubjectInScope(user, subjectId) {
    if (!this.subjectScope) return;
    await this.subjectScope.forUser(user).assert(subjectId);
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

  _isBlank(value) {
    return value === undefined || value === null || value === '';
  }

  // ISO timestamp -> ISO string; null/'' clears the field; undefined = absent.
  _parseTimestamp(raw, field) {
    if (raw === undefined) return undefined;
    if (raw === null || raw === '') return null;
    const ms = toMs(raw);
    if (ms == null) {
      throw httpError(400, 'VALIDATION_ERROR', `${field} must be an ISO-8601 timestamp.`);
    }
    return new Date(ms).toISOString();
  }

  _parseMaxFollowUpsTotal(raw) {
    if (raw === undefined) return undefined;
    if (raw === null || raw === '') return null;
    const [min, max] = MAX_FOLLOW_UPS_TOTAL_RANGE;
    const value = Number(raw);
    if (!Number.isInteger(value) || value < min || value > max) {
      throw httpError(
        400,
        'VALIDATION_ERROR',
        `max_follow_ups_total must be null or an integer between ${min} and ${max}.`,
      );
    }
    return value;
  }

  // bloom_distribution: { LEVEL: count } over the valid Bloom levels with
  // non-negative integer counts summing to main_question_count; null clears it
  // (quota then follows the bank's proportions). Zero counts are dropped.
  _parseBloomDistribution(raw, mainQuestionCount) {
    if (raw === undefined) return undefined;
    if (raw === null || raw === '') return null;
    if (typeof raw !== 'object' || Array.isArray(raw)) {
      throw httpError(400, 'VALIDATION_ERROR', 'bloom_distribution must be an object of Bloom level -> count.');
    }
    const out = {};
    let sum = 0;
    for (const [key, val] of Object.entries(raw)) {
      const level = String(key).toUpperCase();
      if (!BLOOM_ORDER.includes(level)) {
        throw httpError(
          400,
          'VALIDATION_ERROR',
          `bloom_distribution level must be one of ${BLOOM_ORDER.join(', ')}.`,
        );
      }
      const count = Number(val);
      if (!Number.isInteger(count) || count < 0) {
        throw httpError(400, 'VALIDATION_ERROR', 'bloom_distribution counts must be non-negative integers.');
      }
      if (count > 0) out[level] = (out[level] || 0) + count;
      sum += count;
    }
    if (sum !== Number(mainQuestionCount)) {
      throw httpError(
        400,
        'VALIDATION_ERROR',
        `bloom_distribution must sum to main_question_count (${mainQuestionCount}), got ${sum}.`,
      );
    }
    return out;
  }

  // Validate the schedule window + Step-12 fields against the effective
  // (patched over current) values. Returns only the provided fields.
  _validateScheduleFields(input, current = {}) {
    const out = {};
    const field = (snake, camel) => (input[snake] !== undefined ? input[snake] : input[camel]);
    const opensAt = this._parseTimestamp(field('opens_at', 'opensAt'), 'opens_at');
    const closesAt = this._parseTimestamp(field('closes_at', 'closesAt'), 'closes_at');
    if (opensAt !== undefined) out.opens_at = opensAt;
    if (closesAt !== undefined) out.closes_at = closesAt;
    const effOpens = toMs(opensAt !== undefined ? opensAt : current.opens_at);
    const effCloses = toMs(closesAt !== undefined ? closesAt : current.closes_at);
    if (effOpens != null && effCloses != null && effCloses <= effOpens) {
      throw httpError(400, 'VALIDATION_ERROR', 'closes_at must be after opens_at.');
    }

    const maxTotal = this._parseMaxFollowUpsTotal(field('max_follow_ups_total', 'maxFollowUpsTotal'));
    if (maxTotal !== undefined) out.max_follow_ups_total = maxTotal;

    const rawBloom = field('bloom_distribution', 'bloomDistribution');
    const mainCount = current.main_question_count ?? CONFIG_DEFAULTS.main_question_count;
    if (rawBloom !== undefined) {
      out.bloom_distribution = this._parseBloomDistribution(rawBloom, mainCount);
    } else if (current.bloom_distribution && current.main_question_count_changed) {
      // A new main_question_count must keep an existing distribution coherent.
      this._parseBloomDistribution(current.bloom_distribution, mainCount);
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
    const schedule = this._validateScheduleFields(rest, {
      main_question_count: config.main_question_count,
    });

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
      sessionTimeLimitSec: config.session_time_limit_sec,
      maxFollowUpsTotal: schedule.max_follow_ups_total ?? null,
      bloomDistribution: schedule.bloom_distribution ?? null,
      opensAt: schedule.opens_at ?? null,
      closesAt: schedule.closes_at ?? null,
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
    const mainChanged = patch.main_question_count !== undefined
      && Number(patch.main_question_count) !== Number(session.main_question_count);
    Object.assign(patch, this._validateScheduleFields(rest, {
      ...session,
      main_question_count: patch.main_question_count ?? session.main_question_count,
      main_question_count_changed: mainChanged,
    }));

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

  // --- Schedule / start / close (Step 12) ----------------------------------
  //   lecturer: DRAFT -> SCHEDULED (schedule), SCHEDULED -> DRAFT (unschedule)
  //   ADMIN:    SCHEDULED -> OPEN (start), re-warm
  //   ADMIN or scoped LECTURER: OPEN -> CLOSED (close)

  async _run(fn) {
    if (this.db && typeof this.db.withTransaction === 'function') {
      return this.db.withTransaction((tx) => fn(tx));
    }
    return fn(undefined);
  }

  _assertAdmin(user) {
    if (!user || user.role !== 'ADMIN') {
      throw httpError(403, 'FORBIDDEN', 'This action requires an ADMIN.');
    }
  }

  // APPROVED bank of the topic with Bloom levels. Falls back to bare ids
  // (level unknown) for repositories without the Step-12 method.
  async _loadBank(topicId) {
    if (typeof this.examSessionRepository.listApprovedQuestionsInTopic === 'function') {
      return this.examSessionRepository.listApprovedQuestionsInTopic(topicId);
    }
    const ids = await this.examSessionRepository.listApprovedQuestionIdsInTopic(topicId);
    return ids.map((id) => ({ question_id: id, bloom_level: null }));
  }

  // Enough APPROVED questions in total AND per Bloom level for one candidate:
  // the per-level need is bloom_distribution, or the bank proportions (which
  // the picker uses too). Otherwise 409 NOT_ENOUGH_QUESTIONS with details
  // { required, available, byLevel: { LEVEL: { required, available } } }.
  async _assertEnoughQuestions(session) {
    const bank = await this._loadBank(session.topic_id);
    const required = Number(session.main_question_count) || CONFIG_DEFAULTS.main_question_count;
    const available = bank.length;
    const quota = computeBloomQuota(bank, required, session.bloom_distribution || null);
    const counts = countByLevel(bank);
    const byLevel = {};
    for (const level of new Set([...Object.keys(quota), ...Object.keys(counts)])) {
      byLevel[level] = { required: quota[level] || 0, available: counts[level] || 0 };
    }
    const shortLevels = Object.entries(byLevel)
      .filter(([, v]) => v.available < v.required)
      .map(([level]) => level);
    if (available < required || shortLevels.length > 0) {
      const err = httpError(
        409,
        'NOT_ENOUGH_QUESTIONS',
        available < required
          ? `Topic has ${available} APPROVED questions but ${required} are required.`
          : `Not enough APPROVED questions for Bloom level(s): ${shortLevels.join(', ')}.`,
      );
      err.details = { required, available, byLevel };
      throw err;
    }
    return bank;
  }

  async scheduleSession({ user, examSessionId } = {}) {
    const session = await this._loadScopedSession(user, examSessionId);
    assertTransition(session.status, 'SCHEDULED');

    const opensMs = toMs(session.opens_at);
    const closesMs = toMs(session.closes_at);
    if (opensMs == null || closesMs == null) {
      throw httpError(400, 'VALIDATION_ERROR', 'opens_at and closes_at are required to schedule an exam.');
    }
    if (closesMs <= opensMs) {
      throw httpError(400, 'VALIDATION_ERROR', 'closes_at must be after opens_at.');
    }
    const now = this.clock();
    if (closesMs <= now.getTime()) {
      throw httpError(400, 'VALIDATION_ERROR', 'closes_at must be in the future.');
    }
    await this._assertEnoughQuestions(session);

    const updated = await this.examSessionRepository.transitionStatus(
      session.exam_session_id,
      ['DRAFT'],
      'SCHEDULED',
      { scheduled_at: now.toISOString(), scheduled_by: user ? user.id : null },
    );
    if (!updated) assertTransition('UNKNOWN', 'SCHEDULED');
    return updated;
  }

  async unscheduleSession({ user, examSessionId } = {}) {
    const session = await this._loadScopedSession(user, examSessionId);
    assertTransition(session.status, 'DRAFT');
    const updated = await this.examSessionRepository.transitionStatus(
      session.exam_session_id,
      ['SCHEDULED'],
      'DRAFT',
      { scheduled_at: null, scheduled_by: null },
    );
    if (!updated) assertTransition('UNKNOWN', 'DRAFT');
    return updated;
  }

  // ADMIN start: SCHEDULED -> OPEN. One transaction flips the status (only if
  // still SCHEDULED), stamps started_at/by and locks the rubric of every
  // APPROVED question of the topic. opens_at is NOT overwritten: students can
  // start from opens_at (or now, when started late). Warm-up, audio
  // pre-generation and keep-warm run after commit and are NOT awaited.
  async startSession({ user, examSessionId } = {}) {
    this._assertAdmin(user);
    const session = await this._loadScopedSession(user, examSessionId);
    assertTransition(session.status, 'OPEN');

    const now = this.clock();
    const closesMs = toMs(session.closes_at);
    if (closesMs != null && now.getTime() >= closesMs) {
      throw httpError(409, 'EXAM_WINDOW_PASSED', 'The exam window has already passed; reschedule it first.');
    }
    const bank = await this._assertEnoughQuestions(session);
    const rubricIds = [...new Set(bank
      .map((q) => (q.rubric_id != null ? Number(q.rubric_id) : null))
      .filter((id) => id != null))];

    const updated = await this._run(async (tx) => {
      const row = await this.examSessionRepository.transitionStatus(
        session.exam_session_id,
        ['SCHEDULED'],
        'OPEN',
        { started_at: now.toISOString(), started_by: user.id },
        tx,
      );
      if (!row) assertTransition('UNKNOWN', 'OPEN');
      for (const rubricId of rubricIds) {
        // eslint-disable-next-line no-await-in-loop
        await this.rubricRepository.setLocked(rubricId, true, tx);
      }
      return row;
    });

    this._launchInBackground(updated);
    return updated;
  }

  // Fire-and-forget: the response must not wait for a cold Lambda.
  _launchInBackground(session) {
    if (!this.examLaunchService || typeof this.examLaunchService.launch !== 'function') return;
    Promise.resolve()
      .then(() => this.examLaunchService.launch(session))
      .catch((err) => {
        this.logger.error({ err, examSessionId: session.exam_session_id }, 'exam launch failed');
      });
  }

  // Manual re-warm (ADMIN) of a SCHEDULED or OPEN exam; awaited, returns the
  // merged warm_status.
  async warmSession({ user, examSessionId } = {}) {
    this._assertAdmin(user);
    const session = await this._loadScopedSession(user, examSessionId);
    if (!['SCHEDULED', 'OPEN'].includes(session.status)) {
      throw httpError(409, 'INVALID_STATE', 'Only SCHEDULED or OPEN exam sessions can be warmed.');
    }
    if (!this.examLaunchService) return session.warm_status || null;
    return this.examLaunchService.warm(session);
  }

  // OPEN -> CLOSED for ADMIN or a LECTURER in scope (_loadScopedSession).
  // closes_at moves to now only when closing early; a later close keeps the
  // scheduled end.
  async closeSession({ user, examSessionId } = {}) {
    const session = await this._loadScopedSession(user, examSessionId);
    assertTransition(session.status, 'CLOSED');
    const now = this.clock();
    const closesMs = toMs(session.closes_at);
    const patch = closesMs == null || now.getTime() < closesMs ? { closes_at: now.toISOString() } : {};
    const updated = await this.examSessionRepository.transitionStatus(
      session.exam_session_id,
      ['OPEN'],
      'CLOSED',
      patch,
    );
    if (!updated) assertTransition('UNKNOWN', 'CLOSED');
    return updated;
  }

  // Admin exam schedule. status: one status or a comma list (default: every
  // non-DRAFT status); subjectId: positive int; from/to: ISO bounds on opens_at.
  async listScheduleForAdmin({
    user, status, subjectId, from, to,
  } = {}) {
    if (user) this._assertAdmin(user);
    let statuses = DEFAULT_SCHEDULE_STATUSES;
    if (!this._isBlank(status)) {
      statuses = String(status).split(',').map((x) => x.trim().toUpperCase()).filter(Boolean);
      const bad = statuses.find((x) => !STATUSES.includes(x));
      if (bad) {
        throw httpError(400, 'VALIDATION_ERROR', `status must be one of ${STATUSES.join(', ')}.`);
      }
    }
    const parsedSubjectId = this._isBlank(subjectId) ? null : this._parseId(subjectId, 'subjectId');
    const fromIso = this._parseTimestamp(this._isBlank(from) ? undefined : from, 'from') ?? null;
    const toIso = this._parseTimestamp(this._isBlank(to) ? undefined : to, 'to') ?? null;
    if (fromIso && toIso && toMs(toIso) <= toMs(fromIso)) {
      throw httpError(400, 'VALIDATION_ERROR', 'to must be after from.');
    }
    return this.examSessionRepository.listSchedule({
      statuses, subjectId: parsedSubjectId, from: fromIso, to: toIso,
    });
  }

  // --- Reusable main-question picker (Chon cau chinh, Steps 6-7) -----------

  // Randomly select `count` APPROVED question ids from the topic. Returns fewer
  // ids only if the topic has fewer than `count` APPROVED questions.
  async pickMainQuestions(topicId, count) {
    const ids = await this.examSessionRepository.listApprovedQuestionIdsInTopic(topicId);
    // Shared Fisher-Yates picker with the injected randomness source.
    return pickRandom(ids, count, this.random);
  }
}

module.exports = { ExamSessionService };
