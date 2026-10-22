// KEEP_WARM and PREPARE_EXAM_AUDIO job handlers (Step 12).
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  makeKeepWarmHandler, makePrepareExamAudioHandler, registerDefaultHandlers,
} = require('../src/jobs/handlers');
const { ExamLaunchService } = require('../src/services/examLaunchService');
const { fixedClock } = require('./helpers/interviewFakes');

const NOW = '2026-06-01T09:00:00.000Z';
const silent = { info() {}, warn() {}, error() {} };

function fakeRepo(session, bank = []) {
  const repo = {
    session: { warm_status: null, ...session },
    async findById(id) { return Number(id) === repo.session.exam_session_id ? { ...repo.session } : null; },
    async mergeWarmStatus(id, partial) {
      repo.session.warm_status = { ...(repo.session.warm_status || {}), ...structuredClone(partial) };
      return { ...repo.session };
    },
    async listApprovedQuestionsInTopic() { return bank.map((q) => ({ ...q })); },
    async countApprovedQuestionsInTopic() { return bank.length; },
  };
  return repo;
}

function keepWarmWorld(sessionOver = {}) {
  const repo = fakeRepo({
    exam_session_id: 4, status: 'OPEN', language: 'VI', closes_at: '2026-06-01T11:00:00.000Z', ...sessionOver,
  });
  const clock = fixedClock(NOW);
  const warmCalls = [];
  const launch = new ExamLaunchService({
    sttAdapter: { async warmUp(lang) { warmCalls.push(['stt', lang]); return { ok: true, ms: 3 }; } },
    ttsAdapter: { async warmUp(lang) { warmCalls.push(['tts', lang]); return { ok: true, ms: 4 }; } },
    examSessionRepository: repo,
    enqueueJob: async () => {},
    clock,
    logger: silent,
  });
  const enqueued = [];
  const handler = makeKeepWarmHandler({
    examSessionRepository: repo,
    examLaunchService: launch,
    enqueueJob: async (type, payload, opts) => { enqueued.push({ type, payload, opts }); },
    clock,
    logger: silent,
  });
  return {
    repo, clock, warmCalls, enqueued, handler,
  };
}

const job = (payload, over = {}) => ({
  background_job_id: 1, payload, attempts: 1, max_attempts: 3, ...over,
});

test('KEEP_WARM: OPEN and before closes_at -> warms both and re-enqueues +5 min', async () => {
  const w = keepWarmWorld();
  await w.handler(job({ examSessionId: 4 }));
  assert.deepEqual(w.warmCalls.sort(), [['stt', 'vi'], ['tts', 'vi']]);
  assert.equal(w.enqueued.length, 1);
  assert.equal(w.enqueued[0].type, 'KEEP_WARM');
  assert.deepEqual(w.enqueued[0].payload, { examSessionId: 4 });
  assert.equal(w.enqueued[0].opts.runAfter.toISOString(), '2026-06-01T09:05:00.000Z');
  const ws = w.repo.session.warm_status;
  assert.equal(ws.stt.ok, true);
  assert.equal(ws.tts.ms, 4);
  assert.deepEqual(ws.keepWarm, { state: 'active', nextAt: '2026-06-01T09:05:00.000Z' });
});

test('KEEP_WARM: CLOSED -> stops without warming or re-enqueueing', async () => {
  const w = keepWarmWorld({ status: 'CLOSED' });
  await w.handler(job({ examSessionId: 4 }));
  assert.deepEqual(w.warmCalls, []);
  assert.deepEqual(w.enqueued, []);
  assert.equal(w.repo.session.warm_status.keepWarm.state, 'stopped');
});

test('KEEP_WARM: past closes_at -> stops even while still OPEN', async () => {
  const w = keepWarmWorld();
  w.clock.set('2026-06-01T11:00:00.000Z');
  await w.handler(job({ examSessionId: 4 }));
  assert.deepEqual(w.warmCalls, []);
  assert.deepEqual(w.enqueued, []);
  assert.equal(w.repo.session.warm_status.keepWarm.state, 'stopped');
});

test('KEEP_WARM: missing payload or session is discarded without throwing', async () => {
  const w = keepWarmWorld();
  await assert.doesNotReject(() => w.handler(job({})));
  await assert.doesNotReject(() => w.handler(job({ examSessionId: 999 })));
  assert.deepEqual(w.enqueued, []);
});

test('PREPARE_EXAM_AUDIO: synthesizes every APPROVED question in the exam language and tracks progress', async () => {
  const bank = [
    { question_id: 1, content: 'Q1' }, { question_id: 2, content: 'Q2' }, { question_id: 3, content: 'Q3' },
  ];
  const repo = fakeRepo({ exam_session_id: 4, status: 'OPEN', language: 'EN', topic_id: 11 }, bank);
  const calls = [];
  const handler = makePrepareExamAudioHandler({
    examSessionRepository: repo,
    ttsAdapter: { async synthesize(args) { calls.push(args); return { audioKey: `k/${args.text}` }; } },
    logger: silent,
  });
  await handler(job({ examSessionId: 4 }));
  assert.deepEqual(calls, [
    { text: 'Q1', language: 'EN' }, { text: 'Q2', language: 'EN' }, { text: 'Q3', language: 'EN' },
  ]);
  assert.deepEqual(repo.session.warm_status.audio, { done: 3, total: 3, state: 'done' });
});

test('PREPARE_EXAM_AUDIO: a TTS error throws (retry) and marks retrying, the last attempt failed', async () => {
  const bank = [{ question_id: 1, content: 'Q1' }, { question_id: 2, content: 'Q2' }];
  const repo = fakeRepo({ exam_session_id: 4, status: 'OPEN', language: 'VI', topic_id: 11 }, bank);
  let n = 0;
  const handler = makePrepareExamAudioHandler({
    examSessionRepository: repo,
    ttsAdapter: {
      async synthesize() {
        n += 1;
        if (n === 2) throw new Error('throttled');
        return { audioKey: 'k' };
      },
    },
    logger: silent,
  });
  await assert.rejects(() => handler(job({ examSessionId: 4 }, { attempts: 1 })), /throttled/);
  assert.deepEqual(repo.session.warm_status.audio, {
    done: 1, total: 2, state: 'retrying', error: 'throttled',
  });
  n = 1;
  await assert.rejects(() => handler(job({ examSessionId: 4 }, { attempts: 3 })), /throttled/);
  assert.equal(repo.session.warm_status.audio.state, 'failed');
});

test('PREPARE_EXAM_AUDIO: a CLOSED exam is skipped', async () => {
  const repo = fakeRepo({ exam_session_id: 4, status: 'CLOSED', language: 'VI', topic_id: 11 }, [{ question_id: 1, content: 'Q' }]);
  const calls = [];
  const handler = makePrepareExamAudioHandler({
    examSessionRepository: repo,
    ttsAdapter: { async synthesize(a) { calls.push(a); } },
    logger: silent,
  });
  await handler(job({ examSessionId: 4 }));
  assert.deepEqual(calls, []);
  assert.equal(repo.session.warm_status.audio.state, 'skipped');
});

test('registerDefaultHandlers registers KEEP_WARM and PREPARE_EXAM_AUDIO (real or stub)', () => {
  const registered = new Map();
  const queue = {
    logger: silent,
    registerHandler(type, fn) { registered.set(type, fn); },
    async enqueue() {},
  };
  registerDefaultHandlers(queue, { logger: silent });
  assert.ok(registered.has('KEEP_WARM'));
  assert.ok(registered.has('PREPARE_EXAM_AUDIO'));
  const repo = fakeRepo({ exam_session_id: 4, status: 'OPEN' });
  registerDefaultHandlers(queue, {
    logger: silent,
    examSessionRepository: repo,
    examLaunchService: new ExamLaunchService({ examSessionRepository: repo, logger: silent }),
    ttsAdapter: { async synthesize() {} },
  });
  assert.equal(registered.get('KEEP_WARM').name, 'keepWarmHandler');
  assert.equal(registered.get('PREPARE_EXAM_AUDIO').name, 'prepareExamAudioHandler');
});
