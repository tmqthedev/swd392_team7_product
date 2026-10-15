const crypto = require('crypto');

// Password hashing uses Node's built-in crypto scrypt (NO bcrypt dependency):
// the project already standardises on Node crypto and scrypt is a memory-hard
// KDF suitable for password storage. Format: scrypt$N$r$p$<saltB64>$<hashB64>.
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 64;
const SALT_BYTES = 16;
const MIN_LENGTH = 8;

function scryptKey(password, salt, N, r, p) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, KEY_LEN, { N, r, p, maxmem: 128 * N * r * 2 }, (err, derived) => {
      if (err) return reject(err);
      resolve(derived);
    });
  });
}

function assertStrong(password) {
  if (typeof password !== 'string' || password.length < MIN_LENGTH) {
    const err = new Error(`Password must be at least ${MIN_LENGTH} characters.`);
    err.statusCode = 400;
    err.code = 'VALIDATION_ERROR';
    throw err;
  }
  return password;
}

async function hash(password) {
  assertStrong(password);
  const salt = crypto.randomBytes(SALT_BYTES);
  const derived = await scryptKey(password, salt, SCRYPT_N, SCRYPT_R, SCRYPT_P);
  return [
    'scrypt',
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString('base64'),
    derived.toString('base64'),
  ].join('$');
}

async function verify(password, stored) {
  if (typeof password !== 'string' || typeof stored !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return false;
  let salt;
  let expected;
  try {
    salt = Buffer.from(parts[4], 'base64');
    expected = Buffer.from(parts[5], 'base64');
  } catch {
    return false;
  }
  let derived;
  try {
    derived = await scryptKey(password, salt, N, r, p);
  } catch {
    return false;
  }
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

module.exports = { hash, verify, assertStrong, MIN_LENGTH };
