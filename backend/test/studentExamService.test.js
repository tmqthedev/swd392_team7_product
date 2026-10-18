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
