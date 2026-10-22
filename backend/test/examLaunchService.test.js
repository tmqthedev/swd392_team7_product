const test = require('node:test');
const assert = require('node:assert/strict');
const { ExamLaunchService, adapterLanguage } = require('../src/services/examLaunchService');
const { fixedClock, recordingEnqueue } = require('./helpers/interviewFakes');

const NOW = '2026-06-01T08:00:00.000Z';
const silent = { info() {}, warn() {}, error() {} };

function fakeRepo({ approved = 3 } = {}) {
  const repo = {
    warm: {},
    writes: [],
    async mergeWarmStatus(id, partial) {
      repo.writes.push({ id, partial: structuredClone(partial) });
      repo.warm = { ...repo.warm, ...partial };
      return { exam_session_id: id, warm_status: { ...repo.warm } };
    },
    async countApprovedQuestionsInTopic() { return approved; },
  };
  return repo;
}

// Adapter whose warmUp resolves only when released, to prove parallelism.
function gatedAdapter(result = { ok: true, ms: 12 }) {
  const adapter = {
    calls: [],
    release: null,
    async warmUp(lang) {
      adapter.calls.push(lang);
      await new Promise((resolve) => { adapter.release = resolve; });
      if (result instanceof Error) throw result;
      return result;
    },
  };
  return adapter;
}

const SESSION = { exam_session_id: 9, topic_id: 11, language: 'EN' };

test('adapterLanguage maps VI/EN to vi/en', () => {
  assert.equal(adapterLanguage('EN'), 'en');
  assert.equal(adapterLanguage('VI'), 'vi');
  assert.equal(adapterLanguage(undefined), 'vi');
});

test('launch: STT and TTS warm in parallel, warm_status written, jobs enqueued with runAfter', async () => {
  const stt = gatedAdapter({ ok: true, ms: 1500 });
  const tts = gatedAdapter({ ok: false, ms: 30, error: 'cold start timeout' });
  const repo = fakeRepo({ approved: 5 });
  const enqueueJob = recordingEnqueue();
  const calls = [];
  const enqueue = async (type, payload, options) => {
    calls.push({ type, payload, options });
    return enqueueJob(type, payload);
  };
  const clock = fixedClock(NOW);
  const service = new ExamLaunchService({
    sttAdapter: stt, ttsAdapter: tts, examSessionRepository: repo, enqueueJob: enqueue, clock, logger: silent,
  });

  const done = service.launch(SESSION);
  // Both warm-ups are in flight before either resolves.
  for (let i = 0; i < 5 && (stt.calls.length === 0 || tts.calls.length === 0); i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => { setImmediate(resolve); });
  }
  assert.deepEqual(stt.calls, ['en']);
  assert.deepEqual(tts.calls, ['en']);
  // Jobs are already enqueued while the Lambdas are still warming.
  assert.deepEqual(calls.map((c) => c.type), ['PREPARE_EXAM_AUDIO', 'KEEP_WARM']);
  assert.deepEqual(calls[0].payload, { examSessionId: 9 });
  assert.equal(calls[1].options.runAfter.toISOString(), '2026-06-01T08:05:00.000Z');
  stt.release();
  tts.release();
  await done;

  assert.deepEqual(repo.warm.audio, { done: 0, total: 5, state: 'pending' });
  assert.deepEqual(repo.warm.keepWarm, { state: 'active', nextAt: '2026-06-01T08:05:00.000Z' });
  assert.deepEqual(repo.warm.stt, { ok: true, ms: 1500, at: NOW });
  assert.deepEqual(repo.warm.tts, {
    ok: false, ms: 30, at: NOW, error: 'cold start timeout',
  });
});

test('launch never throws: a rejecting adapter and a failing enqueue are captured', async () => {
  const errors = [];
  const repo = fakeRepo();
  const service = new ExamLaunchService({
    sttAdapter: { async warmUp() { throw new Error('boom'); } },
    ttsAdapter: { async warmUp() { return { ok: true, ms: 1 }; } },
    examSessionRepository: repo,
    enqueueJob: async (type) => { if (type === 'PREPARE_EXAM_AUDIO') throw new Error('db down'); },
    clock: fixedClock(NOW),
    logger: { ...silent, error(obj) { errors.push(obj); } },
  });
  await service.launch(SESSION);
  assert.equal(repo.warm.stt.ok, false);
  assert.equal(repo.warm.stt.error, 'boom');
  assert.equal(repo.warm.tts.ok, true);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].step, 'enqueue PREPARE_EXAM_AUDIO');
  // A broken repository is also swallowed.
  const broken = new ExamLaunchService({
    sttAdapter: {},
    ttsAdapter: {},
    examSessionRepository: { async mergeWarmStatus() { throw new Error('nope'); } },
    enqueueJob: async () => {},
    clock: fixedClock(NOW),
    logger: silent,
  });
  await assert.doesNotReject(() => broken.launch(SESSION));
  await assert.doesNotReject(() => broken.launch(null));
});

test('launch: an empty bank marks audio done', async () => {
  const repo = fakeRepo({ approved: 0 });
  const service = new ExamLaunchService({
    sttAdapter: {}, ttsAdapter: {}, examSessionRepository: repo, enqueueJob: async () => {}, clock: fixedClock(NOW), logger: silent,
  });
  await service.launch(SESSION);
  assert.deepEqual(repo.warm.audio, { done: 0, total: 0, state: 'done' });
});

test('warm: re-warms both and returns the merged warm_status; custom interval', async () => {
  const repo = fakeRepo();
  repo.warm = { audio: { done: 3, total: 3, state: 'done' } };
  const service = new ExamLaunchService({
    sttAdapter: { async warmUp(lang) { return { ok: true, ms: 5, language: lang }; } },
    ttsAdapter: { async warmUp() { return { ok: true, ms: 7 }; } },
    examSessionRepository: repo,
    enqueueJob: async () => {},
    clock: fixedClock(NOW),
    logger: silent,
    keepWarmIntervalMs: 60000,
  });
  const status = await service.warm({ exam_session_id: 9, language: 'VI' });
  assert.deepEqual(status.stt, { ok: true, ms: 5, at: NOW });
  assert.deepEqual(status.tts, { ok: true, ms: 7, at: NOW });
  assert.deepEqual(status.audio, { done: 3, total: 3, state: 'done' });
  assert.equal(service.nextKeepWarmAt().toISOString(), '2026-06-01T08:01:00.000Z');
});
