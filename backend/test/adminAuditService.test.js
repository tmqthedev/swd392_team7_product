const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const pino = require('pino');

const { createApp } = require('../src/app');
const { InMemoryDatabase } = require('../src/db/createDatabase');
const { ACCESS_COOKIE } = require('../src/auth/cookieNames');

// Every successful admin write records one audit row (actor, action, entity
// type, entity id); failed writes record nothing. IDs only, no payload.
function build({ fail = false } = {}) {
  const recorded = [];
  const auditLogRepository = {
    async record(entry) { recorded.push(entry); return entry; },
    async list() { return { entries: recorded, total: recorded.length }; },
  };
  const boom = () => { const e = new Error('nope'); e.statusCode = 409; e.code = 'SUBJECT_IN_USE'; throw e; };
  const adminService = {
    async createUser() { return { id: 41, role: 'STUDENT' }; },
    async updateUser(id) { return { id }; },
    async deleteUser(id) { if (fail) boom(); return { id, status: 'DELETED' }; },
    async createSubject() { return { id: 7 }; },
    async deleteSubject() { if (fail) boom(); return { ok: true }; },
    async setSubjectArchived(id) { return { id, status: 'ARCHIVED' }; },
    async importStudents() { return { ok: true, created: [{ id: 51 }, { id: 52 }] }; },
  };
  const app = createApp({
    env: { awsMockMode: true, dbMockMode: true },
    database: new InMemoryDatabase({ persist: false }),
    logger: pino({ level: 'silent' }),
    adminService,
    auditLogRepository,
  });
  const { token } = app.authContext.tokenService.signAccess({ sub: 9, role: 'ADMIN' });
  return { app, recorded, cookie: `${ACCESS_COOKIE}=${token}` };
}

test('admin writes are audited with the actor id and entity id', async () => {
  const { app, recorded, cookie } = build();
  await request(app).post('/api/admin/users').set('Cookie', cookie).send({ email: 'a@x.io', role: 'STUDENT', code: 'S1' }).expect(201);
  await request(app).put('/api/admin/users/41').set('Cookie', cookie).send({ role: 'LECTURER' }).expect(200);
  await request(app).delete('/api/admin/users/41').set('Cookie', cookie).expect(200);
  await request(app).post('/api/admin/subjects').set('Cookie', cookie).send({ code: 'C', name: 'N' }).expect(201);
  await request(app).post('/api/admin/subjects/7/archive').set('Cookie', cookie).expect(200);
  await request(app).delete('/api/admin/subjects/7').set('Cookie', cookie).expect(204);
  assert.deepEqual(recorded.map((r) => [r.actorId, r.action, r.entityType, r.entityId]), [
    [9, 'USER_CREATE', 'USER', 41],
    [9, 'USER_UPDATE_ROLE', 'USER', 41],
    [9, 'USER_DELETE', 'USER', 41],
    [9, 'SUBJECT_CREATE', 'SUBJECT', 7],
    [9, 'SUBJECT_ARCHIVE', 'SUBJECT', 7],
    [9, 'SUBJECT_DELETE', 'SUBJECT', 7],
  ]);
  const log = await request(app).get('/api/admin/audit-log').set('Cookie', cookie).expect(200);
  assert.equal(log.body.total, 6);
});

test('a bulk import records one row per created user', async () => {
  const { app, recorded, cookie } = build();
  await request(app).post('/api/admin/users/import').set('Cookie', cookie)
    .set('Content-Type', 'application/octet-stream').send(Buffer.from('xlsx')).expect(201);
  assert.deepEqual(recorded.map((r) => r.entityId), [51, 52]);
});

test('a failed admin write records nothing', async () => {
  const { app, recorded, cookie } = build({ fail: true });
  await request(app).delete('/api/admin/users/3').set('Cookie', cookie).expect(409);
  await request(app).delete('/api/admin/subjects/3').set('Cookie', cookie).expect(409);
  assert.equal(recorded.length, 0);
});
