const test = require('node:test');
const assert = require('node:assert/strict');
const {
  toStudentResultView,
  toStudentResultListItem,
  assertStudentResultSafe,
  ALL_STUDENT_RESULT_FORBIDDEN_KEYS,
} = require('../src/interview/studentResultView');

test('toStudentResultListItem - extracts only allowed fields', () => {
  const row = {
    viva_result_id: 101,
    exam_session_id: 202,
    session_title: 'Software Architecture Viva',
    subject_code: 'SWD392',
    subject_name: 'Software Architecture & Design',
    topic_name: 'Microservices Pattern',
    finalized_at: new Date('2026-10-25T10:00:00Z'),
    final_total_score: 8.5,
    ai_total_score: 7.5,
    student_id: 12,
    interview_id: 45,
  };

  const item = toStudentResultListItem(row);
  assert.equal(item.resultId, 101);
  assert.equal(item.examSessionId, 202);
  assert.equal(item.examTitle, 'Software Architecture Viva');
  assert.equal(item.subjectCode, 'SWD392');
  assert.equal(item.subjectName, 'Software Architecture & Design');
  assert.equal(item.topicName, 'Microservices Pattern');
  assert.equal(item.finalizedAt, '2026-10-25T10:00:00.000Z');
  assert.equal(item.totalScore, 8.5);

  assert.equal(item.student_id, undefined);
  assert.equal(item.interview_id, undefined);
});

test('toStudentResultView - builds full allowed structure and strips forbidden keys', () => {
  const detail = {
    result: {
      viva_result_id: 101,
      exam_session_id: 202,
      session_title: 'Software Architecture Viva',
      subject_code: 'SWD392',
      subject_name: 'Software Architecture & Design',
      topic_name: 'Microservices Pattern',
      finalized_at: new Date('2026-10-25T10:00:00Z'),
      final_total_score: 9.0,
      ai_total_score: 8.0,
      finalized_by: 5,
    },
    evaluations: [
      {
        order_no: 1,
        question_content: 'What is the circuit breaker pattern?',
        final_score: 9.0,
        ai_score: 8.0,
        question_rationale: 'Secret rationale',
        reference_answer: 'Secret answer',
        flag_reason: 'Flagged for anomaly',
        criteria: [
          {
            criterion_name: 'Clarity',
            final_score: 9.0,
            ai_score: 8.0,
            criterion_max_score: 10,
            criterion_weight: 100,
            ai_justification: 'AI evaluated student speech well',
            evidence: ['Quote from answer'],
          },
        ],
      },
    ],
  };

  const view = toStudentResultView(detail);
  assert.equal(view.resultId, 101);
  assert.equal(view.examTitle, 'Software Architecture Viva');
  assert.equal(view.totalScore, 9.0);
  assert.equal(view.questions.length, 1);
  assert.equal(view.questions[0].orderNo, 1);
  assert.equal(view.questions[0].questionContent, 'What is the circuit breaker pattern?');
  assert.equal(view.questions[0].score, 9.0);
  assert.equal(view.questions[0].criteria.length, 1);
  assert.equal(view.questions[0].criteria[0].criterionName, 'Clarity');
  assert.equal(view.questions[0].criteria[0].score, 9.0);
  assert.equal(view.questions[0].criteria[0].maxScore, 10);
  assert.equal(view.questions[0].criteria[0].weight, 100);

  // Assert forbidden fields are absent
  assert.equal(view.finalized_by, undefined);
  assert.equal(view.questions[0].question_rationale, undefined);
  assert.equal(view.questions[0].reference_answer, undefined);
  assert.equal(view.questions[0].flag_reason, undefined);
  assert.equal(view.questions[0].criteria[0].ai_justification, undefined);
  assert.equal(view.questions[0].criteria[0].evidence, undefined);
});

test('assertStudentResultSafe - throws STUDENT_VIEW_LEAK when any forbidden key is present', () => {
  for (const forbiddenKey of ALL_STUDENT_RESULT_FORBIDDEN_KEYS) {
    const leakyObj = {
      resultId: 1,
      [forbiddenKey]: 'secret-value',
    };
    assert.throws(
      () => assertStudentResultSafe(leakyObj),
      (err) => err.code === 'STUDENT_VIEW_LEAK' && err.statusCode === 500,
      `Should throw for forbidden key ${forbiddenKey}`
    );
  }
});
