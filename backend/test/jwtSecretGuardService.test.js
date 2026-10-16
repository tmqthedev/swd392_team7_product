const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveJwtSecret, DEV_FALLBACK_SECRET } = require('../src/auth/resolveJwtSecret');

test('resolveJwtSecret returns the dev fallback in mock mode with an empty secret', () => {
  const secret = resolveJwtSecret({ awsMockMode: true, jwtSecret: '' });
  assert.equal(secret, DEV_FALLBACK_SECRET);
});

test('resolveJwtSecret hard-fails in non-mock mode with an empty secret', () => {
  assert.throws(
    () => resolveJwtSecret({ awsMockMode: false, jwtSecret: '' }),
    (error) => {
      assert.equal(error.code, 'JWT_SECRET_REQUIRED');
      return true;
    },
  );
});

test('resolveJwtSecret returns the configured secret in non-mock mode', () => {
  const secret = resolveJwtSecret({ awsMockMode: false, jwtSecret: 'real' });
  assert.equal(secret, 'real');
});
