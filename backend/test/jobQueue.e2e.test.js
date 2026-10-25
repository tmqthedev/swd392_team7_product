/**
 * Background-job queue E2E (Jest). Requires a real Postgres (SKIP LOCKED is a
 * Postgres feature the in-memory DB cannot emulate).
 *
 * Self-skips when TEST_DATABASE_URL (or DATABASE_URL) is unset, so
 * `npm run test:e2e` stays green without Docker.
 */
const path = require('path');
const { Pool } = require('pg');
const { runMigrations } = require('../src/db/migrationRunner');
const { BackgroundJobRepository } = require('../src/repositories/backgroundJobRepository');
const { JobQueue } = require('../src/jobs/jobQueue');

const DB_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
const MIGRATIONS_DIR = path.resolve(__dirname, '..', 'db', 'migrations');

const silentLogger = { info() {}, warn() {}, error() {} };

// Minimal PgDatabase-like adapter: a pool with a withTransaction that holds a
// client for the duration of the callback (so FOR UPDATE SKIP LOCKED holds).
function makeDb(pool) {
  return {
    pool,
    query: (text, params) => pool.query(text, params),
    async withTransaction(callback) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await callback({ query: (t, p) => client.query(t, p) });
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    },
  };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const describeOrSkip = DB_URL ? describe : describe.skip;

describeOrSkip('background_job queue e2e (requires Postgres)', () => {
  jest.setTimeout(60000);
  let pool;
  let db;
  let repo;

  beforeAll(async () => {
    pool = new Pool({ connectionString: DB_URL });
    await runMigrations({ pool, dir: MIGRATIONS_DIR, logger: silentLogger });
    db = makeDb(pool);
    repo = new BackgroundJobRepository(db);
  });

  afterAll(async () => {
    if (pool) await pool.end();
  });

  beforeEach(async () => {
    await pool.query('DELETE FROM background_job');
  });

  test('two concurrent claims never return the same job (SKIP LOCKED)', async () => {
    const a = await repo.enqueue('SEND_EMAIL', { n: 1 }, { maxAttempts: 3 });
    const b = await repo.enqueue('SEND_EMAIL', { n: 2 }, { maxAttempts: 3 });

    // Two independent transactions claim in parallel.
    const [claimA, claimB] = await Promise.all([
      db.withTransaction((tx) => repo.claimNext(tx)),
      db.withTransaction((tx) => repo.claimNext(tx)),
    ]);

    expect(claimA).toBeTruthy();
    expect(claimB).toBeTruthy();
    const claimedIds = new Set([claimA.background_job_id, claimB.background_job_id]);
    expect(claimedIds.size).toBe(2);
    expect(claimedIds.has(a.background_job_id)).toBe(true);
    expect(claimedIds.has(b.background_job_id)).toBe(true);

    // Nothing left PENDING, so a third claim comes back empty.
    const third = await db.withTransaction((tx) => repo.claimNext(tx));
    expect(third).toBeNull();
  });

  test('markFailed with attempts < max re-queues with a future run_after then the job succeeds', async () => {
    const queue = new JobQueue({
      db,
      repository: repo,
      env: { jobQueueConcurrency: 1, jobQueuePollIntervalMs: 50, jobMaxAttempts: 3 },
      logger: silentLogger,
    });

    let calls = 0;
    queue.registerHandler('GENERATE_QUESTIONS', async () => {
      calls += 1;
      if (calls === 1) throw new Error('transient failure');
      // second attempt succeeds
    });

    const job = await queue.enqueue('GENERATE_QUESTIONS', { x: 1 });
    queue.start();

    // Wait for eventual success. Backoff base is pollIntervalMs (50ms).
    let final;
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      final = await repo.findById(job.background_job_id);
      if (final.status === 'DONE') break;
      await sleep(50);
    }
    await queue.stop();

    expect(calls).toBeGreaterThanOrEqual(2);
    expect(final.status).toBe('DONE');
    expect(final.attempts).toBeGreaterThanOrEqual(2);
  });

  test('a job left RUNNING (simulated crash) can be re-claimed after reset', async () => {
    const job = await repo.enqueue('INGEST_MATERIAL', { file: 'a.pdf' }, { maxAttempts: 3 });

    // Simulate a worker crash: claim the job (-> RUNNING) but never finish it.
    const claimed = await db.withTransaction((tx) => repo.claimNext(tx));
    expect(claimed.background_job_id).toBe(job.background_job_id);
    expect(claimed.status).toBe('RUNNING');

    // While it is RUNNING it cannot be claimed again.
    const blocked = await db.withTransaction((tx) => repo.claimNext(tx));
    expect(blocked).toBeNull();

    // The recovery sweep (run by the queue on start and periodically) resets
    // stale RUNNING jobs back to PENDING.
    const recovered = await repo.requeueStale({ olderThanMs: 0 });
    expect(recovered.map((row) => row.background_job_id)).toEqual([job.background_job_id]);
    expect(recovered[0].status).toBe('PENDING');

    const reclaimed = await db.withTransaction((tx) => repo.claimNext(tx));
    expect(reclaimed).toBeTruthy();
    expect(reclaimed.background_job_id).toBe(job.background_job_id);
    expect(reclaimed.status).toBe('RUNNING');
  });
  test('EXPIRE_INTERVIEWS job type is accepted by Postgres constraint', async () => {
    const job = await repo.enqueue('EXPIRE_INTERVIEWS', {}, { maxAttempts: 1 });
    expect(job).toBeTruthy();
    expect(job.type).toBe('EXPIRE_INTERVIEWS');
  });
});