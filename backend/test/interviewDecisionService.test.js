const test = require('node:test');
const assert = require('node:assert/strict');
const { decideNextStep, shouldConsultLlm, followUpsRemaining } = require('../src/interview/decideNextStep');
const {
  canTransition, assertTransition, INTERVIEW_TRANSITIONS,
} = require('../src/domain/interviewStatus');

const NOW = new Date('2026-01-01T10:00:00.000Z');
const FUTURE = '2026-01-01T10:30:00.000Z';
const PAST = '2026-01-01T09:59:59.000Z';
const ASK = { next_action: 'ASK_FOLLOW_UP' };
const NEXT = { next_action: 'NEXT_MAIN_QUESTION' };

function decide(over = {}) {
  return decideNextStep({
    now: NOW,
    deadlineAt: FUTURE,
    answerText: 'a real answer',
    followUpsUsed: 0,
    maxFollowUps: 2,
    llmDecision: ASK,
    ...over,
  });
}

test('(1) deadline passed -> END_SESSION even with LLM ASK and a non-empty answer', () => {
  assert.deepEqual(decide({ deadlineAt: PAST }), { action: 'END_SESSION', reason: 'DEADLINE_REACHED' });
});

test('(1) deadline == now -> END_SESSION', () => {
  assert.equal(decide({ deadlineAt: NOW.toISOString() }).action, 'END_SESSION');
});

test('(2) empty or whitespace answer -> NEXT_MAIN without follow-up', () => {
  for (const answerText of ['', '   \n\t ', null, undefined]) {
    assert.deepEqual(decide({ answerText }), { action: 'NEXT_MAIN', reason: 'EMPTY_ANSWER' });
  }
});

test('(3) LLM ASK with follow-ups remaining -> ASK_FOLLOW_UP', () => {
  assert.deepEqual(decide({ followUpsUsed: 1, maxFollowUps: 2 }), {
    action: 'ASK_FOLLOW_UP', reason: 'LLM_FOLLOW_UP',
  });
});

test('(4) LLM ASK but follow-ups exhausted -> NEXT_MAIN (LLM cannot extend limits)', () => {
  const step = decide({ followUpsUsed: 2, maxFollowUps: 2 });
  assert.equal(step.action, 'NEXT_MAIN');
  assert.equal(step.reason, 'LLM_NEXT_MAIN');
});

test('(4) LLM NEXT_MAIN_QUESTION -> NEXT_MAIN', () => {
  assert.deepEqual(decide({ llmDecision: NEXT }), { action: 'NEXT_MAIN', reason: 'LLM_NEXT_MAIN' });
});

test('(4) no LLM decision -> NEXT_MAIN with a reason', () => {
  assert.deepEqual(decide({ llmDecision: null }), { action: 'NEXT_MAIN', reason: 'LLM_UNAVAILABLE' });
  assert.deepEqual(
    decide({ llmDecision: undefined, followUpsUsed: 2, maxFollowUps: 2 }),
    { action: 'NEXT_MAIN', reason: 'FOLLOW_UPS_EXHAUSTED' },
  );
});

test('maxFollowUps 0 -> never a follow-up', () => {
  assert.equal(decide({ maxFollowUps: 0 }).action, 'NEXT_MAIN');
});

test('shouldConsultLlm is false for an empty answer or exhausted follow-ups', () => {
  assert.equal(shouldConsultLlm({ answerText: ' ', followUpsUsed: 0, maxFollowUps: 2 }), false);
  assert.equal(shouldConsultLlm({ answerText: 'x', followUpsUsed: 2, maxFollowUps: 2 }), false);
  assert.equal(shouldConsultLlm({ answerText: 'x', followUpsUsed: 0, maxFollowUps: 0 }), false);
  assert.equal(shouldConsultLlm({ answerText: 'x', followUpsUsed: 1, maxFollowUps: 2 }), true);
});

// --- Per-candidate total cap (Step 12) -------------------------------------------

test('(3)/(4) total cap: ASK only while BOTH the per-question and the total cap allow', () => {
  assert.equal(decide({ totalFollowUpsUsed: 2, maxFollowUpsTotal: 3 }).action, 'ASK_FOLLOW_UP');
  assert.deepEqual(
    decide({ totalFollowUpsUsed: 3, maxFollowUpsTotal: 3 }),
    { action: 'NEXT_MAIN', reason: 'LLM_NEXT_MAIN' },
  );
  // Per-question cap still applies when the total has room.
  assert.equal(decide({ followUpsUsed: 2, totalFollowUpsUsed: 2, maxFollowUpsTotal: 10 }).action, 'NEXT_MAIN');
  // Total cap 0 disables follow-ups entirely.
  assert.equal(decide({ maxFollowUpsTotal: 0 }).action, 'NEXT_MAIN');
  // No LLM decision and the total cap reached -> FOLLOW_UPS_EXHAUSTED.
  assert.equal(
    decide({ llmDecision: null, totalFollowUpsUsed: 1, maxFollowUpsTotal: 1 }).reason,
    'FOLLOW_UPS_EXHAUSTED',
  );
});

test('total cap null/undefined means no total cap', () => {
  assert.equal(decide({ totalFollowUpsUsed: 50, maxFollowUpsTotal: null }).action, 'ASK_FOLLOW_UP');
  assert.equal(decide({ totalFollowUpsUsed: 50 }).action, 'ASK_FOLLOW_UP');
});

test('total cap never reorders: deadline and empty answer still win', () => {
  assert.equal(decide({ deadlineAt: PAST, maxFollowUpsTotal: 5 }).action, 'END_SESSION');
  assert.equal(decide({ answerText: '', maxFollowUpsTotal: 5 }).reason, 'EMPTY_ANSWER');
});

test('shouldConsultLlm / followUpsRemaining honor the tighter cap', () => {
  assert.equal(shouldConsultLlm({
    answerText: 'x', followUpsUsed: 0, maxFollowUps: 2, totalFollowUpsUsed: 4, maxFollowUpsTotal: 4,
  }), false);
  assert.equal(shouldConsultLlm({
    answerText: 'x', followUpsUsed: 0, maxFollowUps: 2, totalFollowUpsUsed: 3, maxFollowUpsTotal: 4,
  }), true);
  assert.equal(followUpsRemaining({
    followUpsUsed: 0, maxFollowUps: 2, totalFollowUpsUsed: 3, maxFollowUpsTotal: 4,
  }), 1);
  assert.equal(followUpsRemaining({ followUpsUsed: 1, maxFollowUps: 2 }), 1);
  assert.equal(followUpsRemaining({
    followUpsUsed: 0, maxFollowUps: 2, totalFollowUpsUsed: 9, maxFollowUpsTotal: 4,
  }), 0);
});

test('interview transition table rejects COMPLETED -> IN_PROGRESS', () => {
  assert.equal(canTransition('IN_PROGRESS', 'COMPLETED'), true);
  assert.equal(canTransition('COMPLETED', 'IN_PROGRESS'), false);
  assert.deepEqual(INTERVIEW_TRANSITIONS.TERMINATED, []);
  assert.throws(() => assertTransition('COMPLETED', 'IN_PROGRESS'), (err) => {
    assert.equal(err.statusCode, 409);
    assert.equal(err.code, 'INVALID_TRANSITION');
    return true;
  });
});
