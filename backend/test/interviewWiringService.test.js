const test = require('node:test');
const assert = require('node:assert/strict');
const pino = require('pino');
const request = require('supertest');
const { createApp } = require('../src/app');
const { InMemoryDatabase } = require('../src/db/createDatabase');
const { InterviewService } = require('../src/services/interviewService');
const { SessionContextStore } = require('../src/interview/sessionContextStore');
const { MockSttAdapter } = require('../src/stt/mockSttAdapter');

function buildApp(overrides = {}) {
  return createApp({
    env: { awsMockMode: true, dbMockMode: true },
    database: new InMemoryDatabase({ persist: false }),
    logger: pino({ level: 'silent' }),
    ...overrides,
  });
}

test('createApp wires the interview engine onto app.interviewContext', () => {
  const app = buildApp();
  const ctx = app.interviewContext;
  assert.ok(ctx.interviewService instanceof InterviewService);
  assert.ok(ctx.sessionContextStore instanceof SessionContextStore);
  assert.ok(ctx.sttAdapter instanceof MockSttAdapter);
  assert.equal(typeof ctx.ttsAdapter.synthesize, 'function');
  // The engine reuses the same TTS / STT / context instances it exposes.
  assert.equal(ctx.interviewService.ttsAdapter, ctx.ttsAdapter);
  assert.equal(ctx.interviewService.sttAdapter, ctx.sttAdapter);
  assert.equal(ctx.interviewService.sessionContextStore, ctx.sessionContextStore);
});

test('createApp honors interview overrides as-is', () => {
  const interviewService = { marker: 'svc' };
  const sessionContextStore = { marker: 'ctx' };
  const sttAdapter = { marker: 'stt' };
  const app = buildApp({ interviewService, sessionContextStore, sttAdapter });
  assert.equal(app.interviewContext.interviewService, interviewService);
  assert.equal(app.interviewContext.sessionContextStore, sessionContextStore);
  assert.equal(app.interviewContext.sttAdapter, sttAdapter);
});

test('createApp passes injected clock/random/ttsAdapter into the engine', () => {
  const clock = () => new Date('2026-01-01T00:00:00.000Z');
  const random = () => 0.5;
  const ttsAdapter = { async synthesize() { return { audioKey: 'k' }; } };
  const app = buildApp({ clock, random, ttsAdapter });
  const svc = app.interviewContext.interviewService;
  assert.equal(svc.clock, clock);
  assert.equal(svc.random, random);
  assert.equal(svc.ttsAdapter, ttsAdapter);
});

test('Step 6 mounts no interview transport', async () => {
  const app = buildApp();
  assert.equal((await request(app).post('/api/interviews').send({})).status, 404);
  assert.equal((await request(app).get('/api/interviews/1')).status, 404);
  assert.equal((await request(app).get('/api/me/exam-sessions')).status, 404);
});
