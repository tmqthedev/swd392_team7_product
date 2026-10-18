const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildWorld, EXAM_ID, STUDENT, OTHER_STUDENT,
} = require('./helpers/interviewFakes');
const { STUDENT_FORBIDDEN_KEYS } = require('../src/interview/studentView');

function assertSafe(view) {
  const json = JSON.stringify(view);
  for (const key of STUDENT_FORBIDDEN_KEYS) {
    assert.equal(json.includes(`"${key}"`), false, `leaked forbidden key: ${key}`);
  }
  return view;
}

test('A8: reconnection during active answering preserves turn and calculates accurate remaining time', async () => {
  const world = buildWorld();
  const startView = assertSafe(await world.service.startOrResume({ user: STUDENT, examSessionId: EXAM_ID }));

  // Question played -> ANSWERING phase
  const playedView = assertSafe(await world.service.markQuestionPlayed({
    user: STUDENT, interviewId: startView.interviewId, turnId: startView.currentTurn.turnId,
  }));
  assert.equal(playedView.currentTurn.status, 'ANSWERING');
  const initialRemainingMs = playedView.currentTurn.remainingAnswerMs;
  assert.ok(initialRemainingMs > 0);

  // Student network disconnects for 30 seconds
  world.clock.advance(30000);

  // Reconnection: student calls getCurrentState
  const reconnectedState = assertSafe(await world.service.getCurrentState({
    user: STUDENT,
    interviewId: startView.interviewId,
  }));

  assert.equal(reconnectedState.interviewId, startView.interviewId);
  assert.equal(reconnectedState.currentTurn.turnId, startView.currentTurn.turnId);
  assert.equal(reconnectedState.currentTurn.status, 'ANSWERING');

  // Remaining answer time is reduced by exactly 30 seconds (no time stolen or granted)
  assert.equal(reconnectedState.currentTurn.remainingAnswerMs, initialRemainingMs - 30000);
});

test('A8: reconnection after answer deadline expires auto-finalizes turn as timed out and advances', async () => {
  const world = buildWorld();
  const startView = assertSafe(await world.service.startOrResume({ user: STUDENT, examSessionId: EXAM_ID }));

  await world.service.markQuestionPlayed({
    user: STUDENT, interviewId: startView.interviewId, turnId: startView.currentTurn.turnId,
  });

  // Disconnects for 150 seconds (answer limit is 120s + 5s think time = 125s)
  world.clock.advance(150000);

  // Reconnection: getCurrentState detects expired answer deadline and auto-submits
  const advancedState = assertSafe(await world.service.getCurrentState({
    user: STUDENT,
    interviewId: startView.interviewId,
  }));

  // Turn 1 was finalized as timed out and answered
  const turns = await world.db.qaTurnRepository.listByInterview(startView.interviewId);
  assert.equal(turns[0].status, 'ANSWERED');
  assert.equal(turns[0].timed_out, true);

  // Exam advanced to next main question (question 2)
  assert.notEqual(advancedState.currentTurn.turnId, startView.currentTurn.turnId);
  assert.equal(advancedState.questionNumber, 2);
  assert.equal(advancedState.currentTurn.turnType, 'MAIN');
});

test('A8: reconnection after session deadline expires auto-finalizes interview as DEADLINE_REACHED', async () => {
  const world = buildWorld();
  const startView = assertSafe(await world.service.startOrResume({ user: STUDENT, examSessionId: EXAM_ID }));

  // Student disconnects and session time (1800s = 30m) passes
  world.clock.advance(2000 * 1000);

  const endedState = assertSafe(await world.service.getCurrentState({
    user: STUDENT,
    interviewId: startView.interviewId,
  }));

  assert.equal(endedState.status, 'COMPLETED');
  assert.equal(endedState.endReason, 'DEADLINE_REACHED');
  assert.equal(endedState.currentTurn, null);
});

test('A8: replay / multiple markQuestionPlayed calls are idempotent and never extend deadline', async () => {
  const world = buildWorld();
  const startView = assertSafe(await world.service.startOrResume({ user: STUDENT, examSessionId: EXAM_ID }));

  const firstPlay = assertSafe(await world.service.markQuestionPlayed({
    user: STUDENT, interviewId: startView.interviewId, turnId: startView.currentTurn.turnId,
  }));
  const originalDeadline = firstPlay.currentTurn.answerDeadlineAt;

  // Student refreshes / client re-emits played 10 seconds later
  world.clock.advance(10000);
  const secondPlay = assertSafe(await world.service.markQuestionPlayed({
    user: STUDENT, interviewId: startView.interviewId, turnId: startView.currentTurn.turnId,
  }));

  // Stored deadline is identical; remaining time decreases
  assert.equal(secondPlay.currentTurn.answerDeadlineAt, originalDeadline);
  assert.equal(secondPlay.currentTurn.remainingAnswerMs, firstPlay.currentTurn.remainingAnswerMs - 10000);
});

test('A8: unauthorized reconnection attempt by another student is 404 without leaking interview existence', async () => {
  const world = buildWorld();
  const startView = assertSafe(await world.service.startOrResume({ user: STUDENT, examSessionId: EXAM_ID }));

  await assert.rejects(
    () => world.service.getCurrentState({ user: OTHER_STUDENT, interviewId: startView.interviewId }),
    (err) => {
      assert.equal(err.statusCode, 404);
      assert.equal(err.code, 'INTERVIEW_NOT_FOUND');
      return true;
    },
  );
});
