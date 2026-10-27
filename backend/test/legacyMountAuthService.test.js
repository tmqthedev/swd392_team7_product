const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const pino = require('pino');

const { createApp } = require('../src/app');
const { InMemoryDatabase } = require('../src/db/createDatabase');

// Offline-safe guard check: /api/topics is behind requireAuth, so an
// unauthenticated request must get 401 instead of reaching the handler. The
// old /api/evaluations and /api/lecturer scaffolds are removed and must stay
// unmounted. Uses an in-memory DB (no Postgres).
function createOfflineApp() {
  const database = new InMemoryDatabase({ persist: false });
  return createApp({
    env: { awsMockMode: true, dbMockMode: true },
    database,
    logger: pino({ level: 'silent' }),
  });
}

test('GET /api/topics without auth returns 401', async () => {
  const app = createOfflineApp();
  const res = await request(app).get('/api/topics');
  assert.equal(res.status, 401);
});

test('removed legacy mounts /api/evaluations and /api/lecturer return 404', async () => {
  const app = createOfflineApp();
  for (const url of ['/api/evaluations', '/api/lecturer/sessions']) {
    const res = await request(app).get(url);
    assert.equal(res.status, 404, url);
  }
});
