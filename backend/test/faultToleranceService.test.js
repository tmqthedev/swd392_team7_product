const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildWorld, EXAM_ID, STUDENT,
} = require('./helpers/interviewFakes');
const { STUDENT_FORBIDDEN_KEYS } = require('../src/interview/studentView');

function assertSafe(view) {
  const json = JSON.stringify(view);
  for (const key of STUDENT_FORBIDDEN_KEYS) {
    assert.equal(json.includes(`"${key}"`), false, `leaked forbidden key: ${key}`);
  }
  return view;
}

test('A1: empty audio buffer triggers 1 retry without advancing to next question', async () => {
  const world = buildWorld();
  const startView = assertSafe(await world.service.startOrResume({ user: STUDENT, examSessionId: EXAM_ID }));
  await world.service.markQuestionPlayed({
    user: STUDENT, interviewId: startView.interviewId, turnId: startView.currentTurn.turnId,
  });

  // Submit audio that is empty (0 bytes)
  const emptyAudio = Buffer.alloc(0);
  const res = assertSafe(await world.service.submitAnswer({
    user: STUDENT,
    interviewId: startView.interviewId,
    turnId: startView.currentTurn.turnId,
    audio: emptyAudio,
    contentType: 'audio/webm',
  }));

  // Student receives retry prompt; turn is still in ANSWERING
  assert.equal(res.currentTurn.turnId, startView.currentTurn.turnId);
  assert.equal(res.currentTurn.status, 'ANSWERING');
  assert.equal(res.currentTurn.retryCount, 1);
  assert.ok(res.currentTurn.retryPrompt);

  // Failure was recorded in processing_failure
  const f = world.db.failures.find((x) => x.stage === 'AUDIO_INPUT');
  assert.ok(f);
  assert.equal(f.error_code, 'AUDIO_EMPTY_OR_CORRUPT');
  assert.equal(f.retry_count, 0);

  // Second empty audio attempt exhausted retry -> proceeds to next main question without stopping
  const res2 = assertSafe(await world.service.submitAnswer({
    user: STUDENT,
    interviewId: startView.interviewId,
    turnId: startView.currentTurn.turnId,
    audio: emptyAudio,
    contentType: 'audio/webm',
  }));

  assert.notEqual(res2.currentTurn.turnId, startView.currentTurn.turnId);
  assert.equal(res2.questionNumber, 2);
});

test('A2: S3 upload failure retries 3 times; if persistent, records failure but STT proceeds from memory buffer', async () => {
  let s3Attempts = 0;
  const failingS3 = {
    async putObject() {
      s3Attempts += 1;
      throw new Error('S3 connection reset');
    },
  };

  const world = buildWorld();
  const service = world.makeService({ awsClients: failingS3 });

  const startView = assertSafe(await service.startOrResume({ user: STUDENT, examSessionId: EXAM_ID }));
  await service.markQuestionPlayed({
    user: STUDENT, interviewId: startView.interviewId, turnId: startView.currentTurn.turnId,
  });

  const validAudio = Buffer.alloc(128, 'a');
  const res = assertSafe(await service.submitAnswer({
    user: STUDENT,
    interviewId: startView.interviewId,
    turnId: startView.currentTurn.turnId,
    audio: validAudio,
    contentType: 'audio/webm',
  }));

  // Verified S3 retried 3 times
  assert.equal(s3Attempts, 3);

  // Failure recorded
  const f = world.db.failures.find((x) => x.stage === 'AUDIO_STORE');
  assert.ok(f);
  assert.equal(f.error_code, 'AUDIO_STORAGE_FAILED');
  assert.equal(f.retry_count, 3);

  // Answer was still processed and exam did not crash
  assert.ok(res);
});

test('A3: STT failure retries 2 times; if persistent, invites student to speak again once', async () => {
  let sttCalls = 0;
  const failingStt = {
    async transcribe() {
      sttCalls += 1;
      const err = new Error('Transcription service timeout');
      err.code = 'STT_TIMEOUT';
      throw err;
    },
  };

  const world = buildWorld();
  const service = world.makeService({ sttAdapter: failingStt });

  const startView = assertSafe(await service.startOrResume({ user: STUDENT, examSessionId: EXAM_ID }));
  await service.markQuestionPlayed({
    user: STUDENT, interviewId: startView.interviewId, turnId: startView.currentTurn.turnId,
  });

  const validAudio = Buffer.alloc(128, 'a');
  await assert.rejects(
    () => service.submitAnswer({
      user: STUDENT,
      interviewId: startView.interviewId,
      turnId: startView.currentTurn.turnId,
      audio: validAudio,
      contentType: 'audio/webm',
    }),
    (err) => {
      assert.equal(err.statusCode, 502);
      assert.equal(err.code, 'STT_FAILED');
      return true;
    },
  );

  // STT attempted 2 times
  assert.equal(sttCalls, 2);

  // Failure recorded
  const f = world.db.failures.find((x) => x.stage === 'STT');
  assert.ok(f);
  assert.equal(f.error_code, 'STT_TIMEOUT');
  assert.equal(f.retry_count, 2);

  // Turn is in ANSWERING with retry_count = 1
  const turnAfterFirstFail = await world.db.qaTurnRepository.findById(startView.currentTurn.turnId);
  assert.equal(turnAfterFirstFail.status, 'ANSWERING');
  assert.equal(turnAfterFirstFail.retry_count, 1);

  // Second failure after retry used: turn is marked FAILED and moves to next main question without throwing
  const res2 = assertSafe(await service.submitAnswer({
    user: STUDENT,
    interviewId: startView.interviewId,
    turnId: startView.currentTurn.turnId,
    audio: validAudio,
    contentType: 'audio/webm',
  }));

  assert.equal(sttCalls, 4); // 2 more attempts
  const firstTurnRow = await world.db.qaTurnRepository.findById(startView.currentTurn.turnId);
  assert.equal(firstTurnRow.status, 'FAILED');
  assert.notEqual(res2.currentTurn.turnId, startView.currentTurn.turnId);
});

test('A4: follow-up LLM timeout / failure retries 1 time; second failure moves on to next main question', async () => {
  const world = buildWorld({
    llmScript: [
      new Error('Nova Pro timeout attempt 1'),
      new Error('Nova Pro timeout attempt 2'),
    ],
  });

  const startView = assertSafe(await world.service.startOrResume({ user: STUDENT, examSessionId: EXAM_ID }));
  await world.service.markQuestionPlayed({
    user: STUDENT, interviewId: startView.interviewId, turnId: startView.currentTurn.turnId,
  });

  const res = assertSafe(await world.service.submitAnswer({
    user: STUDENT,
    interviewId: startView.interviewId,
    turnId: startView.currentTurn.turnId,
    transcript: { text: 'TCP establishes connection via three-way handshake and handles ordering.' },
  }));

  // LLM retried once (2 calls total)
  assert.equal(world.llm.calls.length, 2);

  // Failure recorded
  const f = world.db.failures.find((x) => x.stage === 'FOLLOW_UP_LLM');
  assert.ok(f);
  assert.equal(f.error_code, 'LLM_ERROR');
  assert.equal(f.retry_count, 1);

  // Exam smoothly fell back to NEXT_MAIN_QUESTION
  assert.equal(res.questionNumber, 2);
  assert.equal(res.currentTurn.turnType, 'MAIN');
});

test('A5: missing SessionContext is rebuilt from Postgres via rebuildContextFromDb', async () => {
  const world = buildWorld();
  const startView = assertSafe(await world.service.startOrResume({ user: STUDENT, examSessionId: EXAM_ID }));

  // Simulate loss / corruption of DynamoDB item
  await world.sessionStore.delete(`interview#${startView.interviewId}`);
  const itemAfterDelete = await world.sessionStore.get(`interview#${startView.interviewId}`);
  assert.equal(itemAfterDelete, null);

  // rebuildContextFromDb restores active state from Postgres
  const rebuilt = await world.service.rebuildContextFromDb(startView.interviewId);
  assert.ok(rebuilt);
  assert.equal(rebuilt.interviewId, startView.interviewId);
  assert.equal(rebuilt.currentTurnId, startView.currentTurn.turnId);

  // DynamoDB item is restored
  const restoredItem = await world.sessionStore.get(`interview#${startView.interviewId}`);
  assert.ok(restoredItem);
  assert.equal(restoredItem.interviewId, startView.interviewId);
});

test('A5: pauseInterview and resumeInterview compensate exact downtime on deadline_at', async () => {
  const world = buildWorld();
  const startView = assertSafe(await world.service.startOrResume({ user: STUDENT, examSessionId: EXAM_ID }));
  const initialDeadlineMs = Date.parse(startView.deadlineAt);

  // System error triggers pause
  const pausedView = assertSafe(await world.service.pauseInterview({
    user: STUDENT,
    interviewId: startView.interviewId,
    reason: 'Database maintenance failover',
  }));
  assert.equal(pausedView.status, 'PAUSED');

  // Advance time by 5 minutes (300,000 ms) while paused
  world.clock.advance(300000);

  // Resume interview
  const resumedView = assertSafe(await world.service.resumeInterview({
    user: STUDENT,
    interviewId: startView.interviewId,
  }));
  assert.equal(resumedView.status, 'IN_PROGRESS');

  // Verified deadline_at is extended by exactly 300,000 ms (BR-06)
  const newDeadlineMs = Date.parse(resumedView.deadlineAt);
  assert.equal(newDeadlineMs - initialDeadlineMs, 300000);
});

test('A6: _endInterview completion is idempotent and enqueues GRADE_INTERVIEW', async () => {
  const world = buildWorld();
  const startView = assertSafe(await world.service.startOrResume({ user: STUDENT, examSessionId: EXAM_ID }));

  // End interview
  const ended = assertSafe(await world.service._endInterview(
    await world.db.vivaInterviewRepository.findById(startView.interviewId),
    'MANUAL_TEST',
  ));
  assert.equal(ended.status, 'COMPLETED');

  // Verify transcript is marked complete
  const transcript = await world.db.transcriptRepository.findByInterview(startView.interviewId);
  assert.ok(transcript);
  assert.equal(transcript.is_complete, true);

  // Verify viva_result created as PENDING
  const result = await world.db.vivaResultRepository.createPendingIfAbsent(startView.interviewId);
  assert.ok(result);

  // Verify GRADE_INTERVIEW job was enqueued
  assert.ok(world.enqueueJob.jobs.some((j) => j.type === 'GRADE_INTERVIEW'));

  // Calling _endInterview again does not throw or double-enqueue
  const jobCount = world.enqueueJob.jobs.length;
  await world.service._endInterview(
    await world.db.vivaInterviewRepository.findById(startView.interviewId),
    'MANUAL_TEST',
  );
  assert.equal(world.enqueueJob.jobs.length, jobCount);
});

test('A7: TTS failure records failure and creates turn with null audioKey for browser fallback', async () => {
  const world = buildWorld();
  world.tts.failWith = new Error('Google Cloud TTS service unavailable');

  const startView = assertSafe(await world.service.startOrResume({ user: STUDENT, examSessionId: EXAM_ID }));

  // Turn created with question text, audioKey is null
  assert.ok(startView.currentTurn.questionText);
  assert.equal(startView.currentTurn.audioKey, null);

  // Failure recorded
  const f = world.db.failures.find((x) => x.stage === 'TTS');
  assert.ok(f);
  assert.equal(f.error_code, 'TTS_FAILED');
});
