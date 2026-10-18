const test = require('node:test');
const assert = require('node:assert/strict');

const {
  JobQueue,
  computeBackoffMs,
  DEFAULT_BACKOFF_CAP_MS,
} = require('../src/jobs/jobQueue');
const { BackgroundJobRepository } = require('../src/repositories/backgroundJobRepository');

// --- computeBackoffMs: pure, monotonic non-decreasing, capped ----------------

test('computeBackoffMs grows exponentially from the base', () => {
  assert.equal(computeBackoffMs(1, 1000, 60000), 1000);
  assert.equal(computeBackoffMs(2, 1000, 60000), 2000);
  assert.equal(computeBackoffMs(3, 1000, 60000), 4000);
  assert.equal(computeBackoffMs(4, 1000, 60000), 8000);
});

test('computeBackoffMs is monotonic non-decreasing', () => {
  let prev = -1;
  for (let attempt = 1; attempt <= 20; attempt += 1) {
    const delay = computeBackoffMs(attempt, 1000, 60000);
    assert.ok(delay >= prev, `attempt ${attempt}: ${delay} >= ${prev}`);
    prev = delay;
  }
});

test('computeBackoffMs never exceeds the cap', () => {
  for (let attempt = 1; attempt <= 50; attempt += 1) {
    assert.ok(computeBackoffMs(attempt, 1000, 5000) <= 5000);
  }
  assert.equal(computeBackoffMs(100, 1000, DEFAULT_BACKOFF_CAP_MS), DEFAULT_BACKOFF_CAP_MS);
});

// --- markFailed retry-vs-FAILED decision by attempts -------------------------

function makeCapturingQueue() {
  const calls = [];
  const repository = {
    async markDone(id) {
      calls.push({ op: 'markDone', id });
      return { background_job_id: id, status: 'DONE' };
    },
    async markFailed(id, errorText, nextRunAfter) {
      calls.push({ op: 'markFailed', id, errorText, nextRunAfter });
      return { background_job_id: id, status: nextRunAfter ? 'PENDING' : 'FAILED' };
    },
  };
  const queue = new JobQueue({
    db: null,
    repository,
    env: { jobMaxAttempts: 3, jobQueuePollIntervalMs: 1000 },
    logger: { info() {}, warn() {}, error() {} },
  });
  return { queue, calls };
}

test('_handleFailure re-queues with a future run_after while attempts remain', async () => {
  const { queue, calls } = makeCapturingQueue();
  await queue._handleFailure(
    { background_job_id: 7, type: 'SEND_EMAIL', attempts: 1, max_attempts: 3 },
    new Error('boom'),
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0].op, 'markFailed');
  assert.equal(calls[0].errorText, 'boom');
  assert.ok(calls[0].nextRunAfter instanceof Date, 'retry supplies a run_after Date');
  assert.ok(calls[0].nextRunAfter.getTime() > Date.now() - 1000);
});

test('_handleFailure leaves job FAILED once attempts reach max', async () => {
  const { queue, calls } = makeCapturingQueue();
  await queue._handleFailure(
    { background_job_id: 9, type: 'SEND_EMAIL', attempts: 3, max_attempts: 3 },
    new Error('nope'),
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0].op, 'markFailed');
  assert.equal(calls[0].nextRunAfter, null, 'no retry scheduled when exhausted');
});

// --- repository SQL shapes against a fake db stub ----------------------------

function makeFakeDb() {
  const captured = [];
  return {
    captured,
    async query(sql, params) {
      captured.push({ sql, params });
      return { rows: [{ background_job_id: 1 }], rowCount: 1 };
    },
  };
}

test('claimNext SQL uses FOR UPDATE SKIP LOCKED and sets RUNNING', async () => {
  const db = makeFakeDb();
  const repo = new BackgroundJobRepository(db);
  await repo.claimNext();
  const { sql } = db.captured[0];
  assert.match(sql, /FOR UPDATE SKIP LOCKED/);
  assert.match(sql, /status = 'RUNNING'/);
  assert.match(sql, /LIMIT 1/);
});

test('enqueue serializes payload JSON and passes maxAttempts/runAfter', async () => {
  const db = makeFakeDb();
  const repo = new BackgroundJobRepository(db);
  await repo.enqueue('SEND_EMAIL', { to: 'a@b.c' }, { maxAttempts: 5 });
  const { sql, params } = db.captured[0];
  assert.match(sql, /INSERT INTO background_job/);
  assert.equal(params[0], 'SEND_EMAIL');
  assert.equal(params[1], JSON.stringify({ to: 'a@b.c' }));
  assert.equal(params[2], 5);
  assert.equal(params[3], null);
});

test('markDone targets the job id and sets DONE', async () => {
  const db = makeFakeDb();
  const repo = new BackgroundJobRepository(db);
  await repo.markDone(42);
  const { sql, params } = db.captured[0];
  assert.match(sql, /status = 'DONE'/);
  assert.deepEqual(params, [42]);
});

test('markFailed keeps FAILED when no nextRunAfter, PENDING when retrying', async () => {
  const db = makeFakeDb();
  const repo = new BackgroundJobRepository(db);
  await repo.markFailed(3, 'err', null);
  assert.deepEqual(db.captured[0].params, [3, 'err', null]);

  const when = new Date();
  await repo.markFailed(3, 'err2', when);
  assert.deepEqual(db.captured[1].params, [3, 'err2', when]);
});

// --- stale RUNNING recovery ---------------------------------------------------

test('requeueStale only touches RUNNING rows past the lock timeout and fails exhausted jobs', async () => {
  const calls = [];
  const db = { async query(sql, params) { calls.push({ sql, params }); return { rows: [{ background_job_id: 7 }] }; } };
  const repo = new BackgroundJobRepository(db);
  const rows = await repo.requeueStale({ olderThanMs: 60000, defaultMaxAttempts: 3 });
  assert.deepEqual(rows, [{ background_job_id: 7 }]);
  const { sql, params } = calls[0];
  assert.match(sql, /status = 'RUNNING'/);
  assert.match(sql, /locked_at < now\(\)/);
  assert.match(sql, /attempts >= COALESCE\(max_attempts, \$2\) THEN 'FAILED' ELSE 'PENDING'/);
  assert.deepEqual(params, [60000, 3]);
});

test('JobQueue.recoverStale asks the repository using the configured lock timeout', async () => {
  const seen = [];
  const repository = {
    async requeueStale(args) { seen.push(args); return [{ background_job_id: 1 }]; },
  };
  const warnings = [];
  const queue = new JobQueue({
    db: null,
    repository,
    env: { jobMaxAttempts: 4, jobLockTimeoutMs: 1234 },
    logger: { info() {}, warn(...a) { warnings.push(a); }, error() {} },
  });
  const recovered = await queue.recoverStale();
  assert.equal(recovered.length, 1);
  assert.deepEqual(seen, [{ olderThanMs: 1234, defaultMaxAttempts: 4 }]);
  assert.equal(warnings.length, 1);
});
