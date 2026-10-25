const test = require('node:test');
const assert = require('node:assert/strict');
const { makeExpireInterviewsHandler } = require('../src/jobs/handlers');
const { BackgroundJobRepository } = require('../src/repositories/backgroundJobRepository');
const { fixedClock } = require('./helpers/interviewFakes');

const NOW = '2026-10-25T10:00:00.000Z';
const silent = { info() {}, warn() {}, error() {} };

test('makeExpireInterviewsHandler: runs sweep and re-enqueues next run', async () => {
  const clock = fixedClock(NOW);
  let sweepCalledWith = null;
  const mockInterviewService = {
    async expireOverdueInterviews(opts) {
      sweepCalledWith = opts;
      return { ended: 3 };
    },
  };

  const enqueued = [];
  const enqueueJob = async (type, payload, opts) => {
    enqueued.push({ type, payload, opts });
  };

  const handler = makeExpireInterviewsHandler({
    interviewService: mockInterviewService,
    enqueueJob,
    env: { interviewSweepIntervalSec: 60, interviewSweepGraceSec: 30 },
    clock,
    logger: silent,
  });

  await handler({ background_job_id: 101 });

  assert.deepEqual(sweepCalledWith, { graceSec: 30 });
  assert.equal(enqueued.length, 1);
  assert.equal(enqueued[0].type, 'EXPIRE_INTERVIEWS');
  assert.deepEqual(enqueued[0].payload, {});
  // nextAt = NOW + 60s
  const expectedNextAt = new Date(Date.parse(NOW) + 60 * 1000);
  assert.equal(enqueued[0].opts.runAfter.toISOString(), expectedNextAt.toISOString());
});

test('makeExpireInterviewsHandler: if sweep throws, error rethrows and does NOT re-enqueue', async () => {
  const clock = fixedClock(NOW);
  const mockInterviewService = {
    async expireOverdueInterviews() {
      throw new Error('Database connection failure');
    },
  };

  const enqueued = [];
  const enqueueJob = async (type, payload, opts) => {
    enqueued.push({ type, payload, opts });
  };

  const handler = makeExpireInterviewsHandler({
    interviewService: mockInterviewService,
    enqueueJob,
    env: { interviewSweepIntervalSec: 60, interviewSweepGraceSec: 30 },
    clock,
    logger: silent,
  });

  await assert.rejects(
    () => handler({ background_job_id: 102 }),
    /Database connection failure/,
  );

  assert.equal(enqueued.length, 0, 'Must not re-enqueue when sweep throws (prevents duplicate chains)');
});

test('BackgroundJobRepository.existsPending: checks pending or running status', async () => {
  const queries = [];
  const fakeDb = {
    async query(sql, params) {
      queries.push({ sql, params });
      if (params[0] === 'EXPIRE_INTERVIEWS') {
        return { rows: [{ '?column?': 1 }] };
      }
      return { rows: [] };
    },
  };

  const repo = new BackgroundJobRepository(fakeDb);
  const exists = await repo.existsPending('EXPIRE_INTERVIEWS');
  assert.equal(exists, true);
  assert.match(queries[0].sql, /status IN \('PENDING', 'RUNNING'\)/);
  assert.deepEqual(queries[0].params, ['EXPIRE_INTERVIEWS']);

  const notExists = await repo.existsPending('OTHER_TYPE');
  assert.equal(notExists, false);
});
