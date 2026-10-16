const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const pino = require('pino');

const { createApp } = require('../src/app');
const { InMemoryDatabase } = require('../src/db/createDatabase');

// Offline-safe guard check: the three legacy mounts (/topics, /evaluations,
// /api/lecturer) are now behind requireAuth, so an unauthenticated request must
// get 401 instead of reaching the handler. Uses an in-memory DB (no Postgres).
function createOfflineApp() {
  const database = new InMemoryDatabase({ persist: false });
  return createApp({
    env: { awsMockMode: true, dbMockMode: true },
    database,
    logger: pino({ level: 'silent' }),
  });
}

test('GET /topics without auth returns 401', async () => {
  const app = createOfflineApp();
  const res = await request(app).get('/topics');
  assert.equal(res.status, 401);
});

test('GET /evaluations without auth returns 401', async () => {
  const app = createOfflineApp();
  const res = await request(app).get('/evaluations');
  assert.equal(res.status, 401);
});

test('GET /api/lecturer/sessions without auth returns 401', async () => {
  const app = createOfflineApp();
  const res = await request(app).get('/api/lecturer/sessions');
  assert.equal(res.status, 401);
});
