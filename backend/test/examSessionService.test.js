const test = require('node:test');
const assert = require('node:assert/strict');
const { ExamSessionService } = require('../src/services/examSessionService');

const SUBJECT_ID = 7;
const TOPIC_ID = 11;
const LECTURER_ID = 1;

const lecturer = { id: LECTURER_ID, role: 'LECTURER' };
const admin = { id: 99, role: 'ADMIN' };

// --- In-memory fakes (no mock DB; exam_session SQL is unsupported there) -----

class FakeExamSessionRepo {
  constructor() {
    this.rows = new Map();
    this.students = new Map(); // sessionId -> number[]
    this.examiners = new Map(); // sessionId -> number[]
    this.nextId = 1;
    this.approvedQuestionIds = [];
  }

  async create(payload) {
    const id = this.nextId++;
    const row = {
      exam_session_id: id,
      subject_id: payload.subjectId ?? null,
      topic_id: payload.topicId ?? null,
      title: payload.title ?? null,
      language: payload.language ?? null,
      main_question_count: payload.mainQuestionCount ?? null,
      max_follow_ups_per_question: payload.maxFollowUpsPerQuestion ?? null,
      answer_time_limit_sec: payload.answerTimeLimitSec ?? null,
      think_time_sec: payload.thinkTimeSec ?? null,
      opens_at: payload.opensAt ?? null,
      closes_at: payload.closesAt ?? null,
      status: payload.status ?? 'DRAFT',
      created_by: payload.createdBy ?? null,
    };
    this.rows.set(id, row);
    return row;
  }

  async findById(id) {
    return this.rows.get(Number(id)) || null;
  }

  async list() {
    return [...this.rows.values()];
  }

  async listByCreator(createdBy) {
    return [...this.rows.values()].filter((r) => Number(r.created_by) === Number(createdBy));
  }

  async listBySubjectIds(ids) {
    const set = new Set(ids.map(Number));
    return [...this.rows.values()].filter((r) => set.has(Number(r.subject_id)));
  }

  async update(id, patch) {
    const row = this.rows.get(Number(id));
    if (!row) return null;
    Object.assign(row, patch);
    return row;
  }

  async findByIdWithParticipants(id) {
    const row = this.rows.get(Number(id));
    if (!row) return null;
    return {
      ...row,
      students: (this.students.get(Number(id)) || []).map((sid) => ({ student_id: sid })),
      examiners: (this.examiners.get(Number(id)) || []).map((lid) => ({ lecturer_id: lid })),
    };
  }

  async setStudents(id, studentIds) {
    this.students.set(Number(id), [...studentIds]);
    return [...studentIds];
  }

  async setExaminers(id, lecturerIds) {
    this.examiners.set(Number(id), [...lecturerIds]);
    return [...lecturerIds];
  }

  async setStatus(id, status) {
    const row = this.rows.get(Number(id));
    if (!row) return null;
    row.status = status;
    return row;
  }

  async countApprovedQuestionsInTopic() {
    return this.approvedQuestionIds.length;
  }

  async listApprovedQuestionIdsInTopic() {
    return [...this.approvedQuestionIds];
  }
}

function makeService(overrides = {}) {
  const examSessionRepository = overrides.examSessionRepository || new FakeExamSessionRepo();

  const subjectRepository = {
    async listSubjectIdsForLecturer(id) {
      return Number(id) === LECTURER_ID ? (overrides.lecturerSubjects ?? [SUBJECT_ID]) : [];
    },
  };
  const topicRepository = {
    async getById(id) {
      if (overrides.topicMissing) return null;
      return { topic_id: Number(id), subject_id: overrides.topicSubjectId ?? SUBJECT_ID };
    },
  };
  const users = overrides.users || new Map([
    ['S001', { app_user_id: 101, code: 'S001', role: 'STUDENT' }],
    ['S002', { app_user_id: 102, code: 'S002', role: 'STUDENT' }],
    ['L900', { app_user_id: 900, code: 'L900', role: 'LECTURER' }],
  ]);
  const usersById = new Map([...users.values()].map((u) => [u.app_user_id, u]));
  const appUserRepository = {
    async findByCode(code) { return users.get(code) || null; },
    async findById(id) { return usersById.get(Number(id)) || null; },
  };
  const lockedRubrics = [];
  const rubricRepository = {
    async setLocked(rubricId, locked) {
      lockedRubrics.push({ rubricId, locked });
      return { rubric_id: rubricId, is_locked: locked };
    },
  };
  const questionRepository = {
    async findById(id) {
      return { question_id: Number(id), content: `Q${id}`, rubric_id: overrides.rubricIdForQuestions ?? 55 };
    },
  };
  const synthCalls = [];
  const ttsAdapter = {
    async synthesize(args) {
      synthCalls.push(args);
      return { audioKey: `tts/${args.text}.mp3`, cached: false };
    },
  };

  const service = new ExamSessionService({
    examSessionRepository,
    subjectRepository,
    topicRepository,
    appUserRepository,
    rubricRepository,
    questionRepository,
    ttsAdapter,
    db: null,
    logger: { info() {}, warn() {}, error() {} },
  });

  return {
    service, examSessionRepository, lockedRubrics, synthCalls,
  };
}

async function seedDraft(service, repo, over = {}) {
  return service.createSession({
    user: lecturer,
    subjectId: SUBJECT_ID,
    topicId: TOPIC_ID,
    language: 'EN',
    ...over,
  });
}

// --- CRUD + config/language validation ---------------------------------------

test('createSession applies Nhom-3 defaults and starts DRAFT', async () => {
  const { service } = makeService();
  const row = await seedDraft(service);
  assert.equal(row.status, 'DRAFT');
  assert.equal(row.main_question_count, 3);
  assert.equal(row.max_follow_ups_per_question, 2);
  assert.equal(row.answer_time_limit_sec, 120);
  assert.equal(row.think_time_sec, 0);
  assert.equal(row.created_by, LECTURER_ID);
  assert.equal(row.language, 'EN');
});

test('createSession rejects a bad language with VALIDATION_ERROR', async () => {
  const { service } = makeService();
  await assert.rejects(
    () => seedDraft(service, null, { language: 'FR' }),
    (error) => {
      assert.equal(error.statusCode, 400);
      assert.equal(error.code, 'VALIDATION_ERROR');
      return true;
    },
  );
});

test('createSession rejects out-of-range config with VALIDATION_ERROR', async () => {
  const { service } = makeService();
  await assert.rejects(
    () => seedDraft(service, null, { main_question_count: 11 }),
    (error) => {
      assert.equal(error.code, 'VALIDATION_ERROR');
      return true;
    },
  );
  await assert.rejects(
    () => seedDraft(service, null, { answer_time_limit_sec: 5 }),
    (error) => { assert.equal(error.code, 'VALIDATION_ERROR'); return true; },
  );
});

test('createSession denies an out-of-scope lecturer with 403', async () => {
  const { service } = makeService({ lecturerSubjects: [999] });
  await assert.rejects(
    () => seedDraft(service),
    (error) => {
      assert.equal(error.statusCode, 403);
      assert.equal(error.code, 'FORBIDDEN');
      return true;
    },
  );
});

test('createSession allows ADMIN regardless of scope', async () => {
  const { service } = makeService({ lecturerSubjects: [] });
  const row = await service.createSession({
    user: admin, subjectId: SUBJECT_ID, topicId: TOPIC_ID, language: 'VI',
  });
  assert.equal(row.status, 'DRAFT');
});

test('updateSession edits a DRAFT and re-validates', async () => {
  const { service, examSessionRepository } = makeService();
  const row = await seedDraft(service);
  const updated = await service.updateSession({
    user: lecturer, examSessionId: row.exam_session_id, title: 'Final', main_question_count: 5,
  });
  assert.equal(updated.title, 'Final');
  assert.equal(updated.main_question_count, 5);
  // Non-DRAFT is rejected.
  await examSessionRepository.setStatus(row.exam_session_id, 'OPEN');
  await assert.rejects(
    () => service.updateSession({ user: lecturer, examSessionId: row.exam_session_id, title: 'X' }),
    (error) => { assert.equal(error.statusCode, 409); return true; },
  );
});

// --- Roster all-or-nothing ----------------------------------------------------

test('setStudents writes nothing when any code is unknown', async () => {
  const { service, examSessionRepository } = makeService();
  const row = await seedDraft(service);
  const result = await service.setStudents({
    user: lecturer, examSessionId: row.exam_session_id, codes: 'S001\nNOPE',
  });
  assert.equal(result.ok, false);
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].code, 'NOPE');
  assert.equal(examSessionRepository.students.has(row.exam_session_id), false);
});

test('setStudents rejects a non-STUDENT code with zero writes', async () => {
  const { service, examSessionRepository } = makeService();
  const row = await seedDraft(service);
  const result = await service.setStudents({
    user: lecturer, examSessionId: row.exam_session_id, codes: 'S001, L900',
  });
  assert.equal(result.ok, false);
  assert.equal(result.errors[0].code, 'L900');
  assert.equal(examSessionRepository.students.has(row.exam_session_id), false);
});

test('setStudents happy path writes the roster', async () => {
  const { service, examSessionRepository } = makeService();
  const row = await seedDraft(service);
  const result = await service.setStudents({
    user: lecturer, examSessionId: row.exam_session_id, codes: 'S001\nS002\nS001',
  });
  assert.equal(result.ok, true);
  assert.equal(result.students.length, 2);
  assert.deepEqual(examSessionRepository.students.get(row.exam_session_id), [101, 102]);
});

// --- Examiners ----------------------------------------------------------------

test('setExaminers allows LECTURER ids', async () => {
  const { service, examSessionRepository } = makeService();
  const row = await seedDraft(service);
  const result = await service.setExaminers({
    user: lecturer, examSessionId: row.exam_session_id, lecturerIds: [900],
  });
  assert.equal(result.ok, true);
  assert.deepEqual(examSessionRepository.examiners.get(row.exam_session_id), [900]);
});

test('setExaminers rejects a non-lecturer id', async () => {
  const { service } = makeService();
  const row = await seedDraft(service);
  await assert.rejects(
    () => service.setExaminers({ user: lecturer, examSessionId: row.exam_session_id, lecturerIds: [101] }),
    (error) => {
      assert.equal(error.statusCode, 400);
      assert.equal(error.code, 'VALIDATION_ERROR');
      return true;
    },
  );
});

// --- Open / close -------------------------------------------------------------

test('openSession rejects an illegal transition with 409', async () => {
  const { service, examSessionRepository } = makeService();
  const row = await seedDraft(service);
  await examSessionRepository.setStatus(row.exam_session_id, 'CLOSED');
  await assert.rejects(
    () => service.openSession({ user: lecturer, examSessionId: row.exam_session_id }),
    (error) => {
      assert.equal(error.statusCode, 409);
      assert.equal(error.code, 'INVALID_TRANSITION');
      return true;
    },
  );
});

test('openSession throws NOT_ENOUGH_QUESTIONS when the topic lacks APPROVED questions', async () => {
  const { service, examSessionRepository } = makeService();
  const row = await seedDraft(service);
  examSessionRepository.approvedQuestionIds = [201]; // < 3 required
  await assert.rejects(
    () => service.openSession({ user: lecturer, examSessionId: row.exam_session_id }),
    (error) => {
      assert.equal(error.statusCode, 409);
      assert.equal(error.code, 'NOT_ENOUGH_QUESTIONS');
      return true;
    },
  );
});

test('openSession locks the rubric and synthesizes once per main question', async () => {
  const { service, examSessionRepository, lockedRubrics, synthCalls } = makeService();
  const row = await seedDraft(service);
  examSessionRepository.approvedQuestionIds = [201, 202, 203, 204];
  const updated = await service.openSession({ user: lecturer, examSessionId: row.exam_session_id });
  assert.equal(updated.status, 'OPEN');
  assert.ok(updated.opens_at);
  // Rubric lock recorded (all picked questions share rubric 55 -> one lock).
  assert.ok(lockedRubrics.length >= 1);
  assert.ok(lockedRubrics.every((l) => l.locked === true));
  // One TTS synth per main question (default main_question_count = 3).
  assert.equal(synthCalls.length, 3);
});

test('closeSession transitions OPEN -> CLOSED', async () => {
  const { service, examSessionRepository } = makeService();
  const row = await seedDraft(service);
  await examSessionRepository.setStatus(row.exam_session_id, 'OPEN');
  const closed = await service.closeSession({ user: lecturer, examSessionId: row.exam_session_id });
  assert.equal(closed.status, 'CLOSED');
  assert.ok(closed.closes_at);
});

// --- pickMainQuestions --------------------------------------------------------

test('pickMainQuestions returns `count` distinct APPROVED ids from the topic', async () => {
  const { service, examSessionRepository } = makeService();
  examSessionRepository.approvedQuestionIds = [1, 2, 3, 4, 5];
  const picked = await service.pickMainQuestions(TOPIC_ID, 3);
  assert.equal(picked.length, 3);
  assert.equal(new Set(picked).size, 3);
  picked.forEach((id) => assert.ok([1, 2, 3, 4, 5].includes(id)));
});
