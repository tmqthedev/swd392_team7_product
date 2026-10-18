const test = require('node:test');
const assert = require('node:assert/strict');
const { createAuthMiddleware } = require('../src/middleware/auth');
const { verifyOrigin } = require('../src/middleware/csrf');
const { TokenService } = require('../src/auth/tokenService');
const { ACCESS_COOKIE } = require('../src/auth/cookieNames');

const env = { jwtSecret: 'test-secret', jwtAccessTtlSec: 900, jwtRefreshTtlSec: 604800 };

function buildMiddleware() {
  const tokenService = new TokenService({ secret: env.jwtSecret });
  const appUserRepository = { async findById() { return null; } };
  const subjectRepository = {
    async listSubjectIdsForLecturer(id) {
      return id === 10 ? [100, 200] : [];
    },
  };
  const mw = createAuthMiddleware({ tokenService, env, appUserRepository });
  return { mw, tokenService, subjectRepository };
}

function run(middleware, req) {
  return new Promise((resolve) => {
    middleware(req, {}, (err) => resolve(err));
  });
}

test('requireAuth populates req.user from a valid access cookie', async () => {
  const { mw, tokenService } = buildMiddleware();
  const { token } = tokenService.signAccess({ sub: 7, role: 'ADMIN' });
  const req = { cookies: { [ACCESS_COOKIE]: token }, headers: {} };
  const err = await run(mw.requireAuth, req);
  assert.equal(err, undefined);
  assert.equal(req.user.id, 7);
  assert.equal(req.user.role, 'ADMIN');
});

test('requireAuth rejects a missing token with 401', async () => {
  const { mw } = buildMiddleware();
  const req = { cookies: {}, headers: {} };
  const err = await run(mw.requireAuth, req);
  assert.equal(err.statusCode, 401);
});

test('requireRole allows a matching role', async () => {
  const { mw } = buildMiddleware();
  const req = { user: { id: 1, role: 'ADMIN' } };
  const err = await run(mw.requireRole('ADMIN', 'LECTURER'), req);
  assert.equal(err, undefined);
});

test('requireRole denies a non-matching role with 403', async () => {
  const { mw } = buildMiddleware();
  const req = { user: { id: 1, role: 'STUDENT' } };
  const err = await run(mw.requireRole('ADMIN', 'LECTURER'), req);
  assert.equal(err.statusCode, 403);
});

test('requireSubjectScope lets ADMIN bypass', async () => {
  const { mw, subjectRepository } = buildMiddleware();
  const req = { user: { id: 1, role: 'ADMIN' }, params: { subjectId: '999' } };
  const err = await run(mw.requireSubjectScope({ subjectRepository }), req);
  assert.equal(err, undefined);
});

test('requireSubjectScope allows an assigned lecturer', async () => {
  const { mw, subjectRepository } = buildMiddleware();
  const req = { user: { id: 10, role: 'LECTURER' }, params: { subjectId: '100' } };
  const err = await run(mw.requireSubjectScope({ subjectRepository }), req);
  assert.equal(err, undefined);
});

test('requireSubjectScope denies an unassigned lecturer with 403', async () => {
  const { mw, subjectRepository } = buildMiddleware();
  const req = { user: { id: 10, role: 'LECTURER' }, params: { subjectId: '300' } };
  const err = await run(mw.requireSubjectScope({ subjectRepository }), req);
  assert.equal(err.statusCode, 403);
});

test('requireSubjectScope denies a student with 403', async () => {
  const { mw, subjectRepository } = buildMiddleware();
  const req = { user: { id: 2, role: 'STUDENT' }, params: { subjectId: '100' } };
  const err = await run(mw.requireSubjectScope({ subjectRepository }), req);
  assert.equal(err.statusCode, 403);
});

test('verifyOrigin allows safe methods without an Origin', async () => {
  const mw = verifyOrigin(['http://localhost:8080']);
  const err = await run(mw, { method: 'GET', headers: {} });
  assert.equal(err, undefined);
});

test('verifyOrigin allows a matching Origin on a mutating request', async () => {
  const mw = verifyOrigin(['http://localhost:8080']);
  const err = await run(mw, { method: 'POST', headers: { origin: 'http://localhost:8080' } });
  assert.equal(err, undefined);
});

test('verifyOrigin rejects a missing or mismatched Origin on a mutating request', async () => {
  const mw = verifyOrigin(['http://localhost:8080']);
  const missing = await run(mw, { method: 'POST', headers: {} });
  assert.equal(missing.statusCode, 403);
  const mismatch = await run(mw, { method: 'POST', headers: { origin: 'http://evil.example' } });
  assert.equal(mismatch.statusCode, 403);
});
