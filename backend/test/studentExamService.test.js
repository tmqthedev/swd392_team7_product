const test = require('node:test');
const assert = require('node:assert/strict');
const { StudentExamService } = require('../src/services/studentExamService');

test('listExamSessions rejects non-STUDENT users with 403', async () => {
  const service = new StudentExamService({
    examSessionRepository: {},
    vivaInterviewRepository: {},
  });

  await assert.rejects(
    () => service.listExamSessions({ user: { id: 1, role: 'LECTURER' } }),
    (err) => err.statusCode === 403 && err.code === 'FORBIDDEN',
  );
});

test('listExamSessions formats sessions and flags canStart / canResume', async () => {
  const now = new Date('2026-10-18T10:00:00.000Z');
  const fakeRows = [
    {
      exam_session_id: 1,
      title: 'Midterm Viva',
      subject_name: 'Software Architecture',
      subject_code: 'SWD392',
      topic_name: 'Clean Code',
      language: 'VI',
      main_question_count: 3,
      max_follow_ups_per_question: 2,
      answer_time_limit_sec: 120,
      think_time_sec: 15,
      session_time_limit_sec: 1800,
      opens_at: new Date('2026-10-18T08:00:00.000Z'),
      closes_at: new Date('2026-10-18T12:00:00.000Z'),
      status: 'OPEN',
      viva_interview_id: null,
      interview_status: null,
      interview_started_at: null,
      interview_deadline_at: null,
    },
    {
      exam_session_id: 2,
      title: 'Final Viva',
      subject_name: 'Software Architecture',
      subject_code: 'SWD392',
      topic_name: 'Microservices',
      language: 'EN',
      main_question_count: 3,
      max_follow_ups_per_question: 2,
      answer_time_limit_sec: 120,
      think_time_sec: 15,
      session_time_limit_sec: 1800,
      opens_at: new Date('2026-10-18T08:00:00.000Z'),
      closes_at: new Date('2026-10-18T12:00:00.000Z'),
      status: 'OPEN',
      viva_interview_id: 10,
      interview_status: 'IN_PROGRESS',
      interview_started_at: new Date('2026-10-18T09:40:00.000Z'),
      interview_deadline_at: new Date('2026-10-18T10:10:00.000Z'), // deadline > now
    },
    {
      exam_session_id: 3,
      title: 'Draft Exam',
      status: 'DRAFT',
      viva_interview_id: null,
    },
  ];

  const fakeRepo = {
    async listByStudent(studentId) {
      assert.equal(studentId, 42);
      return fakeRows;
    },
  };

  const service = new StudentExamService({
    examSessionRepository: fakeRepo,
    vivaInterviewRepository: {},
    clock: () => now,
  });

  const list = await service.listExamSessions({ user: { id: 42, role: 'STUDENT' } });
  assert.equal(list.length, 3);

  // First session: canStart = true, canResume = false
  assert.equal(list[0].canStart, true);
  assert.equal(list[0].canResume, false);
  assert.equal(list[0].interview, null);

  // Second session: canStart = false, canResume = true
  assert.equal(list[1].canStart, false);
  assert.equal(list[1].canResume, true);
  assert.equal(list[1].interview.status, 'IN_PROGRESS');
  assert.equal(list[1].interview.isExpired, false);

  // Third session: DRAFT, canStart = false, canResume = false
  assert.equal(list[2].canStart, false);
  assert.equal(list[2].canResume, false);
});

test('listExamSessions: SCHEDULED and OPEN-before-opens_at are not startable', async () => {
  const now = new Date('2026-10-18T07:00:00.000Z');
  const base = {
    opens_at: new Date('2026-10-18T08:00:00.000Z'),
    closes_at: new Date('2026-10-18T12:00:00.000Z'),
    viva_interview_id: null,
    max_follow_ups_total: 4,
  };
  const service = new StudentExamService({
    examSessionRepository: {
      async listByStudent() {
        return [
          { ...base, exam_session_id: 1, status: 'SCHEDULED' },
          { ...base, exam_session_id: 2, status: 'OPEN' },
        ];
      },
    },
    vivaInterviewRepository: {},
    clock: () => now,
  });
  const list = await service.listExamSessions({ user: { id: 42, role: 'STUDENT' } });
  assert.equal(list[0].status, 'SCHEDULED');
  assert.equal(list[0].canStart, false);
  assert.equal(list[0].opensAt, '2026-10-18T08:00:00.000Z');
  assert.equal(list[1].canStart, false);
  assert.equal(list[1].maxFollowUpsTotal, 4);
});


test('listResults rejects non-STUDENT users with 403', async () => {
  const service = new StudentExamService({
    examSessionRepository: {},
    vivaInterviewRepository: {},
    vivaResultRepository: {},
  });

  await assert.rejects(
    () => service.listResults({ user: { id: 1, role: 'LECTURER' } }),
    (err) => err.statusCode === 403 && err.code === 'FORBIDDEN',
  );
});

test('listResults returns safe summaries for student finalized results', async () => {
  const fakeVivaRepo = {
    async listFinalizedForStudent(studentId) {
      assert.equal(studentId, 42);
      return [
        {
          viva_result_id: 10,
          exam_session_id: 1,
          session_title: 'Midterm Viva',
          subject_code: 'SWD392',
          subject_name: 'Software Architecture',
          topic_name: 'Clean Code',
          finalized_at: new Date('2026-10-18T10:00:00Z'),
          final_total_score: 9.0,
          ai_total_score: 8.5,
        },
      ];
    },
  };

  const service = new StudentExamService({
    examSessionRepository: {},
    vivaInterviewRepository: {},
    vivaResultRepository: fakeVivaRepo,
  });

  const results = await service.listResults({ user: { id: 42, role: 'STUDENT' } });
  assert.equal(results.length, 1);
  assert.equal(results[0].resultId, 10);
  assert.equal(results[0].examTitle, 'Midterm Viva');
  assert.equal(results[0].totalScore, 9.0);
});

test('getResultDetail rejects non-STUDENT users with 403', async () => {
  const service = new StudentExamService({
    examSessionRepository: {},
    vivaInterviewRepository: {},
    vivaResultRepository: {},
  });

  await assert.rejects(
    () => service.getResultDetail({ user: { id: 1, role: 'LECTURER' }, resultId: 10 }),
    (err) => err.statusCode === 403 && err.code === 'FORBIDDEN',
  );
});

test('getResultDetail returns 404 when result is not found or not finalized', async () => {
  const fakeVivaRepo = {
    async findFinalizedForStudent() {
      return null; // not found, or not finalized, or belonging to another student
    },
  };

  const service = new StudentExamService({
    examSessionRepository: {},
    vivaInterviewRepository: {},
    vivaResultRepository: fakeVivaRepo,
  });

  await assert.rejects(
    () => service.getResultDetail({ user: { id: 42, role: 'STUDENT' }, resultId: 99 }),
    (err) => err.statusCode === 404 && err.code === 'NOT_FOUND',
  );
});

test('getResultDetail returns student-safe breakdown for finalized result', async () => {
  const fakeVivaRepo = {
    async findFinalizedForStudent(resultId, studentId) {
      assert.equal(resultId, 10);
      assert.equal(studentId, 42);
      return {
        result: {
          viva_result_id: 10,
          exam_session_id: 1,
          session_title: 'Midterm Viva',
          subject_code: 'SWD392',
          subject_name: 'Software Architecture',
          topic_name: 'Clean Code',
          finalized_at: new Date('2026-10-18T10:00:00Z'),
          final_total_score: 8.5,
        },
        evaluations: [
          {
            order_no: 1,
            question_content: 'What is Dependency Inversion Principle?',
            final_score: 8.5,
            criteria: [
              {
                criterion_name: 'Explanation Clarity',
                final_score: 8.5,
                criterion_max_score: 10,
                criterion_weight: 100,
              },
            ],
          },
        ],
      };
    },
  };

  const service = new StudentExamService({
    examSessionRepository: {},
    vivaInterviewRepository: {},
    vivaResultRepository: fakeVivaRepo,
  });

  const detail = await service.getResultDetail({ user: { id: 42, role: 'STUDENT' }, resultId: 10 });
  assert.equal(detail.resultId, 10);
  assert.equal(detail.examTitle, 'Midterm Viva');
  assert.equal(detail.totalScore, 8.5);
  assert.equal(detail.questions.length, 1);
  assert.equal(detail.questions[0].orderNo, 1);
  assert.equal(detail.questions[0].score, 8.5);
  assert.equal(detail.questions[0].criteria[0].criterionName, 'Explanation Clarity');
  assert.equal(detail.questions[0].criteria[0].score, 8.5);
});
