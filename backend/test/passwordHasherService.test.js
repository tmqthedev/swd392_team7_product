const test = require('node:test');
const assert = require('node:assert/strict');
const passwordHasher = require('../src/auth/passwordHasher');

test('hashes and verifies a correct password', async () => {
  const hash = await passwordHasher.hash('supersecret');
  assert.match(hash, /^scrypt\$/);
  assert.equal(await passwordHasher.verify('supersecret', hash), true);
});

test('rejects an incorrect password', async () => {
  const hash = await passwordHasher.hash('supersecret');
  assert.equal(await passwordHasher.verify('wrongpassword', hash), false);
});

test('produces distinct hashes for the same password (random salt)', async () => {
  const a = await passwordHasher.hash('supersecret');
  const b = await passwordHasher.hash('supersecret');
  assert.notEqual(a, b);
  assert.equal(await passwordHasher.verify('supersecret', a), true);
  assert.equal(await passwordHasher.verify('supersecret', b), true);
});

test('assertStrong rejects passwords shorter than 8 characters', () => {
  assert.throws(() => passwordHasher.assertStrong('short'), (err) => {
    assert.equal(err.statusCode, 400);
    return true;
  });
});

test('assertStrong accepts an 8-character password', () => {
  assert.equal(passwordHasher.assertStrong('12345678'), '12345678');
});

test('verify returns false for a malformed stored hash', async () => {
  assert.equal(await passwordHasher.verify('supersecret', 'not-a-valid-hash'), false);
});
