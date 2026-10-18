const test = require('node:test');
const assert = require('node:assert/strict');
const { TokenService, sha256, randomToken } = require('../src/auth/tokenService');

function createService(overrides = {}) {
  return new TokenService({
    secret: 'test-secret',
    accessTtlSec: 900,
    refreshTtlSec: 604800,
    ...overrides,
  });
}

test('signs and verifies an access token with expected claims', () => {
  const service = createService();
  const { token, payload } = service.signAccess({ sub: 42, role: 'ADMIN' });
  assert.equal(payload.sub, 42);
  assert.equal(payload.role, 'ADMIN');
  assert.equal(payload.type, 'access');
  assert.ok(payload.jti);
  const decoded = service.verify(token, { type: 'access' });
  assert.equal(decoded.sub, 42);
  assert.equal(decoded.role, 'ADMIN');
});

test('rejects a tampered token signature', () => {
  const service = createService();
  const { token } = service.signAccess({ sub: 1, role: 'LECTURER' });
  const tampered = `${token}x`;
  assert.throws(() => service.verify(tampered), (err) => {
    assert.equal(err.statusCode, 401);
    return true;
  });
});

test('rejects an expired token', () => {
  let now = new Date('2024-01-01T00:00:00Z');
  const service = createService({ accessTtlSec: 10, clock: () => now });
  const { token } = service.signAccess({ sub: 1, role: 'STUDENT' });
  now = new Date('2024-01-01T00:01:00Z');
  assert.throws(() => service.verify(token), (err) => {
    assert.equal(err.statusCode, 401);
    assert.match(err.message, /expired/i);
    return true;
  });
});

test('rejects a token of an unexpected type', () => {
  const service = createService();
  const { token } = service.signRefresh({ sub: 1, role: 'ADMIN' });
  assert.throws(() => service.verify(token, { type: 'access' }), (err) => {
    assert.equal(err.statusCode, 401);
    return true;
  });
});

test('a token signed with a different secret fails verification', () => {
  const a = createService({ secret: 'secret-a' });
  const b = createService({ secret: 'secret-b' });
  const { token } = a.signAccess({ sub: 1, role: 'ADMIN' });
  assert.throws(() => b.verify(token), (err) => {
    assert.equal(err.statusCode, 401);
    return true;
  });
});

test('sha256 is deterministic and randomToken is unique', () => {
  assert.equal(sha256('abc'), sha256('abc'));
  assert.notEqual(randomToken(), randomToken());
});
