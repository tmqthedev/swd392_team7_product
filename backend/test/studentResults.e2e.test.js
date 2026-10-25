/**
 * E2E tests for Student Results and Examiner Grading Guards (Step 13: F10).
 * Tests API routing, auth guards, student-safe allowlist, and data isolation.
 */
const assert = require('node:assert/strict');
const request = require('supertest');
const pino = require('pino');
const { createApp } = require('../src/app');
const { ACCESS_COOKIE } = require('../src/auth/cookieNames');

const testEnv = {
  awsMockMode: true,
  dbMockMode: true,
};

class FakeVivaResultRepo {
  constructor() {
    this.results = new Map();
    this.evaluations = new Map();
    this.criteria = new Map();
    this.examiners = new Map(); // examSessionId -> Set of lecturerIds
  }

  seedResult({
    resultId,
    interviewId,
    examSessionId,
    studentId,
    status = 'FINALIZED',
    finalTotalScore = 8.5,
    finalizedAt = new Date('2026-10-25T10:00:00Z'),
    sessionTitle = 'SWD392 Viva Exam',
    subjectCode = 'SWD392',
    subjectName = 'Software Architecture',
    topicName = 'Design Patterns',
  }) {
    this.results.set(resultId, {
      viva_result_id: resultId,
      interview_id: interviewId,
      exam_session_id: examSessionId,
      student_id: studentId,
      status,
      final_total_score: finalTotalScore,
      ai_total_score: finalTotalScore,
      finalized_at: finalizedAt,
      session_title: sessionTitle,
      subject_code: subjectCode,
      subject_name: subjectName,
      topic_name: topicName,
    });
  }

  seedEvaluation({
    resultId,
    evaluationId,
    orderNo = 1,
    questionContent = 'Explain Singleton Pattern',
    finalScore = 8.5,
    criteria = [],
  }) {
    this.evaluations.set(evaluationId, {
      question_evaluation_id: evaluationId,
      result_id: resultId,
      order_no: orderNo,
      question_content: questionContent,
      final_score: finalScore,
      ai_score: finalScore,
      question_rationale: 'Secret rationale that must not leak',
      reference_answer: 'Secret answer',
      flag_reason: 'Anomaly flag',
      criteria: criteria.map((c, idx) => ({
        criterion_score_id: idx + 1,
        evaluation_id: evaluationId,
        criterion_name: c.name || 'Clarity',
        final_score: c.score ?? 8.5,
        ai_score: c.score ?? 8.5,
        criterion_max_score: c.maxScore ?? 10,
        criterion_weight: c.weight ?? 100,
        ai_justification: 'AI commentary',
        evidence: ['Quote from answer'],
      })),
    });
  }

  async listFinalizedForStudent(studentId) {
    const list = [];
    for (const res of this.results.values()) {
      if (res.student_id === Number(studentId) && res.status === 'FINALIZED') {
        list.push({ ...res });
      }
    }
    return list;
  }

  async findFinalizedForStudent(vivaResultId, studentId) {
    const res = this.results.get(Number(vivaResultId));
    if (!res) return null;
    if (res.student_id !== Number(studentId) || res.status !== 'FINALIZED') return null;

    const evals = [];
    for (const ev of this.evaluations.values()) {
      if (ev.result_id === Number(vivaResultId)) {
        evals.push({ ...ev });
      }
    }

    return {
      result: { ...res },
      evaluations: evals,
    };
  }

  async getFullResultDetail(vivaResultId) {
    const res = this.results.get(Number(vivaResultId));
    if (!res) return null;
    const evals = [];
    for (const ev of this.evaluations.values()) {
      if (ev.result_id === Number(vivaResultId)) {
        evals.push({ ...ev });
      }
    }
    return {
      result: { ...res },
      evaluations: evals,
      scoreAdjustments: [],
    };
  }

  async isExaminerOrCreator(examSessionId, userId) {
    const examiners = this.examiners.get(Number(examSessionId));
    return examiners ? examiners.has(Number(userId)) : false;
  }

  async updateResult(vivaResultId, fields) {
    const res = this.results.get(Number(vivaResultId));
    if (res) {
      Object.assign(res, fields);
    }
    return res;
  }
}

function buildTestContext() {
  const vivaResultRepo = new FakeVivaResultRepo();

  const app = createApp({
    env: testEnv,
    logger: pino({ level: 'silent' }),
    vivaResultRepository: vivaResultRepo,
  });

  const studentACookie = `${ACCESS_COOKIE}=`
    + `${app.authContext.tokenService.signAccess({ sub: 101, role: 'STUDENT' }).token}`;
  const studentBCookie = `${ACCESS_COOKIE}=`
    + `${app.authContext.tokenService.signAccess({ sub: 102, role: 'STUDENT' }).token}`;
  const lecturerCookie = `${ACCESS_COOKIE}=`
    + `${app.authContext.tokenService.signAccess({ sub: 201, role: 'LECTURER' }).token}`;

  return {
    app,
    vivaResultRepo,
    studentACookie,
    studentBCookie,
    lecturerCookie,
  };
}

describe('Student Results & Access Guards (E2E)', () => {
  test('Unauthenticated user receives 401 on /api/me/results', async () => {
    const { app } = buildTestContext();
    const res = await request(app).get('/api/me/results');
    assert.equal(res.status, 401);
  });

  test('LECTURER receives 403 on /api/me/results (student only)', async () => {
    const { app, lecturerCookie } = buildTestContext();
    const res = await request(app)
      .get('/api/me/results')
      .set('Cookie', lecturerCookie);
    assert.equal(res.status, 403);
  });

  test('STUDENT receives 403 when attempting to access lecturer /api/results/:id', async () => {
    const { app, studentACookie } = buildTestContext();
    const res = await request(app)
      .get('/api/results/1')
      .set('Cookie', studentACookie);
    assert.equal(res.status, 403);
  });

  test('Student A can list their finalized results, but cannot see unfinalized results or Student B results', async () => {
    const { app, vivaResultRepo, studentACookie } = buildTestContext();

    // Result 1: Finalized for Student A (101)
    vivaResultRepo.seedResult({
      resultId: 1,
      interviewId: 11,
      examSessionId: 1,
      studentId: 101,
      status: 'FINALIZED',
      finalTotalScore: 8.5,
    });

    // Result 2: In review (not finalized) for Student A (101)
    vivaResultRepo.seedResult({
      resultId: 2,
      interviewId: 12,
      examSessionId: 1,
      studentId: 101,
      status: 'AI_SUGGESTED',
      finalTotalScore: 7.0,
    });

    // Result 3: Finalized for Student B (102)
    vivaResultRepo.seedResult({
      resultId: 3,
      interviewId: 13,
      examSessionId: 1,
      studentId: 102,
      status: 'FINALIZED',
      finalTotalScore: 9.5,
    });

    const res = await request(app)
      .get('/api/me/results')
      .set('Cookie', studentACookie);

    assert.equal(res.status, 200);
    assert.equal(res.body.length, 1);
    assert.equal(res.body[0].resultId, 1);
    assert.equal(res.body[0].totalScore, 8.5);
    assert.equal(res.body[0].examTitle, 'SWD392 Viva Exam');
  });

  test('Student A can view detail of their finalized result with safe allowlisted fields', async () => {
    const { app, vivaResultRepo, studentACookie } = buildTestContext();

    vivaResultRepo.seedResult({
      resultId: 10,
      interviewId: 50,
      examSessionId: 1,
      studentId: 101,
      status: 'FINALIZED',
      finalTotalScore: 9.0,
    });

    vivaResultRepo.seedEvaluation({
      resultId: 10,
      evaluationId: 100,
      orderNo: 1,
      questionContent: 'What is Dependency Inversion Principle?',
      finalScore: 9.0,
      criteria: [
        { name: 'Architecture Knowledge', score: 9.0, maxScore: 10, weight: 100 },
      ],
    });

    const res = await request(app)
      .get('/api/me/results/10')
      .set('Cookie', studentACookie);

    assert.equal(res.status, 200);
    assert.equal(res.body.resultId, 10);
    assert.equal(res.body.totalScore, 9.0);
    assert.equal(res.body.questions.length, 1);
    assert.equal(res.body.questions[0].orderNo, 1);
    assert.equal(res.body.questions[0].score, 9.0);
    assert.equal(res.body.questions[0].criteria[0].criterionName, 'Architecture Knowledge');
    assert.equal(res.body.questions[0].criteria[0].score, 9.0);

    // Verify forbidden fields are NOT returned
    assert.equal(res.body.questions[0].question_rationale, undefined);
    assert.equal(res.body.questions[0].reference_answer, undefined);
    assert.equal(res.body.questions[0].criteria[0].ai_justification, undefined);
    assert.equal(res.body.questions[0].criteria[0].evidence, undefined);
  });

  test('Student A requesting another student\'s result receives 404 (isolation)', async () => {
    const { app, vivaResultRepo, studentACookie } = buildTestContext();

    vivaResultRepo.seedResult({
      resultId: 20,
      interviewId: 60,
      examSessionId: 1,
      studentId: 102, // Belongs to Student B
      status: 'FINALIZED',
      finalTotalScore: 9.0,
    });

    const res = await request(app)
      .get('/api/me/results/20')
      .set('Cookie', studentACookie);

    assert.equal(res.status, 404);
  });

  test('Student requesting an unfinalized result receives 404', async () => {
    const { app, vivaResultRepo, studentACookie } = buildTestContext();

    vivaResultRepo.seedResult({
      resultId: 30,
      interviewId: 70,
      examSessionId: 1,
      studentId: 101,
      status: 'AI_SUGGESTED', // not finalized
      finalTotalScore: 8.0,
    });

    const res = await request(app)
      .get('/api/me/results/30')
      .set('Cookie', studentACookie);

    assert.equal(res.status, 404);
  });

  test('When a result is reopened by a lecturer, it automatically returns 404 for the student', async () => {
    const { app, vivaResultRepo, studentACookie } = buildTestContext();

    vivaResultRepo.seedResult({
      resultId: 40,
      interviewId: 80,
      examSessionId: 1,
      studentId: 101,
      status: 'FINALIZED',
      finalTotalScore: 8.0,
    });

    // Finalized: visible
    const resBefore = await request(app)
      .get('/api/me/results/40')
      .set('Cookie', studentACookie);
    assert.equal(resBefore.status, 200);

    // Lecturer reopens result
    await vivaResultRepo.updateResult(40, { status: 'AI_SUGGESTED' });

    // Now returns 404
    const resAfter = await request(app)
      .get('/api/me/results/40')
      .set('Cookie', studentACookie);
    assert.equal(resAfter.status, 404);
  });
});
