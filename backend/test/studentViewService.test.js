const test = require('node:test');
const assert = require('node:assert/strict');
const {
  toStudentInterviewView, assertStudentSafe, STUDENT_FORBIDDEN_KEYS,
} = require('../src/interview/studentView');

const NOW = new Date('2026-01-01T10:00:00.000Z');
const SECRET_VALUES = ['SECRET-PURPOSE', 'SECRET-WHY', 'SECRET-ANSWER', 'SECRET-KEYPOINT', 'SECRET-REF'];

const EXAM = {
  exam_session_id: 3,
  language: 'VI',
  think_time_sec: 5,
  answer_time_limit_sec: 120,
  max_follow_ups_per_question: 2,
  main_question_count: 3,
  reference_answer: 'SECRET-REF',
};

function interviewRow(over = {}) {
  return {
    viva_interview_id: 9,
    exam_session_id: 3,
    student_id: 42,
    status: 'IN_PROGRESS',
    current_question_index: 1,
    current_follow_up_count: 1,
    deadline_at: '2026-01-01T10:20:00.000Z',
    end_reason: null,
    client_ip: '10.0.0.1',
    ...over,
  };
}

function turnRow(over = {}) {
  return {
    qa_turn_id: 77,
    turn_type: 'FOLLOW_UP',
    question_text: 'Could you elaborate?',
    question_audio_key: 'tts/abc.mp3',
    status: 'ANSWERING',
    asked_at: '2026-01-01T09:59:00.000Z',
    played_at: '2026-01-01T09:59:30.000Z',
    answer_deadline_at: '2026-01-01T10:01:35.000Z',
    rationale: { purpose: 'SECRET-PURPOSE', why: 'SECRET-WHY', grounding: [{ text: 'SECRET-WHY' }] },
    answer_text: 'SECRET-ANSWER',
    key_points: ['SECRET-KEYPOINT'],
    follow_up_reason: 'INCOMPLETE',
    transcript_confidence: 0.9,
    ...over,
  };
}

test('view contains no forbidden key and no rationale/answer value', () => {
  const view = toStudentInterviewView({
    interview: interviewRow(), examSession: EXAM, currentTurn: turnRow(), totalQuestions: 3, now: NOW,
  });
  const json = JSON.stringify(view);
  for (const key of STUDENT_FORBIDDEN_KEYS) {
    assert.equal(json.includes(`"${key}"`), false, `leaked key ${key}`);
  }
  for (const value of SECRET_VALUES) {
    assert.equal(json.includes(value), false, `leaked value ${value}`);
  }
  assert.equal(json.includes('INCOMPLETE'), false);
  assert.equal(json.includes('10.0.0.1'), false);
  assert.doesNotThrow(() => assertStudentSafe(view));
});

test('view exposes progress, timers and the current question', () => {
  const view = toStudentInterviewView({
    interview: interviewRow(), examSession: EXAM, currentTurn: turnRow(), totalQuestions: 3, now: NOW,
  });
  assert.equal(view.interviewId, 9);
  assert.equal(view.questionNumber, 2);
  assert.equal(view.totalQuestions, 3);
  assert.equal(view.followUpNumber, 1);
  assert.equal(view.maxFollowUps, 2);
  assert.equal(view.language, 'VI');
  assert.equal(view.remainingSessionMs, 20 * 60 * 1000);
  assert.equal(view.endReason, null);
  assert.equal(view.currentTurn.turnId, 77);
  assert.equal(view.currentTurn.audioKey, 'tts/abc.mp3');
  assert.equal(view.currentTurn.answerOpensAt, '2026-01-01T09:59:35.000Z');
  assert.equal(view.currentTurn.remainingAnswerMs, 95 * 1000);
});

test('remainingAnswerMs is null while the turn is only ASKED', () => {
  const view = toStudentInterviewView({
    interview: interviewRow(),
    examSession: EXAM,
    currentTurn: turnRow({ status: 'ASKED', played_at: null, answer_deadline_at: null }),
    totalQuestions: 3,
    now: NOW,
  });
  assert.equal(view.currentTurn.remainingAnswerMs, null);
  assert.equal(view.currentTurn.answerOpensAt, null);
});

test('remaining times clamp to 0', () => {
  const view = toStudentInterviewView({
    interview: interviewRow({ deadline_at: '2026-01-01T09:00:00.000Z' }),
    examSession: EXAM,
    currentTurn: turnRow({ answer_deadline_at: '2026-01-01T09:00:00.000Z' }),
    totalQuestions: 3,
    now: NOW,
  });
  assert.equal(view.remainingSessionMs, 0);
  assert.equal(view.currentTurn.remainingAnswerMs, 0);
});

test('an ended view has currentTurn null and exposes the end reason', () => {
  const view = toStudentInterviewView({
    interview: interviewRow({ status: 'COMPLETED', end_reason: 'QUESTIONS_EXHAUSTED' }),
    examSession: EXAM,
    currentTurn: turnRow(),
    totalQuestions: 3,
    now: NOW,
  });
  assert.equal(view.currentTurn, null);
  assert.equal(view.endReason, 'QUESTIONS_EXHAUSTED');
});

test('assertStudentSafe throws on a nested forbidden key', () => {
  assert.throws(
    () => assertStudentSafe({ a: { b: [{ rationale: {} }] } }),
    (err) => err.code === 'STUDENT_VIEW_LEAK',
  );
  assert.throws(() => assertStudentSafe({ currentTurn: { answer_text: 'x' } }));
});
