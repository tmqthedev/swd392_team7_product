const test = require('node:test');
const assert = require('node:assert/strict');
const { AuthService } = require('../src/services/authService');
const { TokenService, sha256 } = require('../src/auth/tokenService');
const passwordHasher = require('../src/auth/passwordHasher');

const TEST_ENV = {
  jwtSecret: 'test-secret',
  jwtAccessTtlSec: 900,
  jwtRefreshTtlSec: 604800,
  passwordSetTtlHours: 72,
  passwordResetTtlMinutes: 30,
  loginMaxFailures: 5,
  loginWindowMinutes: 15,
  loginLockMinutes: 15,
  appBaseUrl: 'http://localhost:8080',
};

class FakeUserRepo {
  constructor(users = []) {
    this.users = new Map(users.map((u) => [u.app_user_id, { ...u }]));
    this.nextId = Math.max(0, ...users.map((u) => u.app_user_id)) + 1;
  }

  async findById(id) {
    const u = this.users.get(id);
    return u ? { ...u } : null;
  }

  async findByEmailOrCode(identifier) {
    for (const u of this.users.values()) {
      if (u.email === identifier || u.code === identifier) return { ...u };
    }
    return null;
  }

  async update(id, patch) {
    const u = this.users.get(id);
    if (!u) return null;
    Object.assign(u, patch, { updated_at: new Date() });
    return { ...u };
  }

  async countByRole(role) {
    return [...this.users.values()].filter((u) => u.role === role).length;
  }

  // Same semantics as AppUserRepository.registerLoginFailure (one atomic step).
  async registerLoginFailure(id, {
    now, windowMs, maxFailures, lockMs,
  }) {
    const u = this.users.get(id);
    if (!u) return null;
    const expired = !u.first_failed_at
      || new Date(u.first_failed_at).getTime() < now.getTime() - windowMs;
    const count = expired ? 1 : (u.failed_login_count || 0) + 1;
    u.failed_login_count = count;
    if (expired) u.first_failed_at = now;
    if (count >= maxFailures) u.locked_until = new Date(now.getTime() + lockMs);
    return { ...u };
  }
}

class FakeSessionRepo {
  constructor() {
    this.sessions = [];
  }

  async create({ userId, refreshTokenHash, expiresAt }) {
    const row = {
      auth_session_id: this.sessions.length + 1,
      user_id: userId,
      refresh_token_hash: refreshTokenHash,
      expires_at: expiresAt,
      revoked_at: null,
    };
    this.sessions.push(row);
    return row;
  }

  async findActiveByHash(hash) {
    return this.sessions.find(
      (s) => s.refresh_token_hash === hash && !s.revoked_at && new Date(s.expires_at) > new Date(),
    ) || null;
  }

  async revoke(hash) {
    const s = this.sessions.find((x) => x.refresh_token_hash === hash && !x.revoked_at);
    if (s) s.revoked_at = new Date();
    return s || null;
  }

  async revokeAllForUser(userId, { exceptHash } = {}) {
    const revoked = [];
    for (const s of this.sessions) {
      if (s.user_id === userId && !s.revoked_at && s.refresh_token_hash !== exceptHash) {
        s.revoked_at = new Date();
        revoked.push(s);
      }
    }
    return revoked;
  }

  activeCount(userId) {
    return this.sessions.filter((s) => s.user_id === userId && !s.revoked_at).length;
  }
}

class FakeTokenRepo {
  constructor() {
    this.tokens = [];
    this.nextId = 1;
  }

  async create({ userId, tokenHash, purpose, expiresAt }) {
    const row = {
      password_token_id: this.nextId++,
      user_id: userId,
      token_hash: tokenHash,
      purpose,
      expires_at: expiresAt,
      used_at: null,
    };
    this.tokens.push(row);
    return row;
  }

  async findActiveByHash(hash, purpose) {
    return this.tokens.find(
      (t) => t.token_hash === hash && t.purpose === purpose && !t.used_at
        && new Date(t.expires_at) > new Date(),
    ) || null;
  }

  async markUsed(id) {
    const t = this.tokens.find((x) => x.password_token_id === id && !x.used_at);
    if (t) t.used_at = new Date();
    return t || null;
  }

  async invalidateActiveForUser(userId, purpose) {
    const out = [];
    for (const t of this.tokens) {
      if (t.user_id === userId && t.purpose === purpose && !t.used_at) {
        t.used_at = new Date();
        out.push(t);
      }
    }
    return out;
  }
}

class FakeJobRepo {
  constructor() {
    this.jobs = [];
  }

  async enqueue(type, payload) {
    const row = { background_job_id: this.jobs.length + 1, type, payload };
    this.jobs.push(row);
    return row;
  }
}

async function buildService({ users = [], clock } = {}) {
  const appUserRepository = new FakeUserRepo(users);
  const authSessionRepository = new FakeSessionRepo();
  const passwordTokenRepository = new FakeTokenRepo();
  const backgroundJobRepository = new FakeJobRepo();
  const tokenService = new TokenService({
    secret: TEST_ENV.jwtSecret,
    accessTtlSec: TEST_ENV.jwtAccessTtlSec,
    refreshTtlSec: TEST_ENV.jwtRefreshTtlSec,
    clock,
  });
  const service = new AuthService({
    appUserRepository,
    authSessionRepository,
    passwordTokenRepository,
    backgroundJobRepository,
    passwordHasher,
    tokenService,
    env: TEST_ENV,
    clock,
  });
  return {
    service,
    appUserRepository,
    authSessionRepository,
    passwordTokenRepository,
    backgroundJobRepository,
    tokenService,
  };
}

async function makeUser(overrides = {}) {
  const passwordHash = await passwordHasher.hash('correct-password');
  return {
    app_user_id: 1,
    code: 'U001',
    email: 'user@aives.local',
    full_name: 'Test User',
    password_hash: passwordHash,
    role: 'LECTURER',
    status: 'ACTIVE',
    failed_login_count: 0,
    locked_until: null,
    must_change_password: false,
    updated_at: new Date(),
    ...overrides,
  };
}

test('login succeeds with correct credentials and sets no password_hash in response', async () => {
  const user = await makeUser();
  const { service, authSessionRepository } = await buildService({ users: [user] });
  const result = await service.login({ identifier: 'user@aives.local', password: 'correct-password' });
  assert.ok(result.accessToken);
  assert.ok(result.refreshToken);
  assert.equal(result.user.email, 'user@aives.local');
  assert.equal('password_hash' in result.user, false);
  assert.equal(authSessionRepository.activeCount(1), 1);
});

test('login works by code as well as email', async () => {
  const user = await makeUser();
  const { service } = await buildService({ users: [user] });
  const result = await service.login({ identifier: 'U001', password: 'correct-password' });
  assert.ok(result.accessToken);
});

test('login locks the account after reaching the failure threshold', async () => {
  const now = new Date('2024-01-01T00:00:00Z');
  const user = await makeUser({ updated_at: now });
  const { service, appUserRepository } = await buildService({ users: [user], clock: () => now });

  for (let i = 0; i < 5; i += 1) {
    await assert.rejects(
      () => service.login({ identifier: 'user@aives.local', password: 'wrong' }),
      (err) => err.statusCode === 401,
    );
  }
  const stored = await appUserRepository.findById(1);
  assert.equal(stored.failed_login_count, 5);
  assert.ok(stored.locked_until);

  await assert.rejects(
    () => service.login({ identifier: 'user@aives.local', password: 'correct-password' }),
    (err) => {
      assert.equal(err.statusCode, 423);
      return true;
    },
  );
});

test('refresh rotates the session: old token revoked, new one issued', async () => {
  const user = await makeUser();
  const { service, authSessionRepository } = await buildService({ users: [user] });
  const login = await service.login({ identifier: 'user@aives.local', password: 'correct-password' });
  const oldHash = sha256(login.refreshToken);

  const refreshed = await service.refresh(login.refreshToken);
  assert.ok(refreshed.refreshToken);
  assert.notEqual(refreshed.refreshToken, login.refreshToken);

  // old session is revoked
  assert.equal(await authSessionRepository.findActiveByHash(oldHash), null);
  // new session active
  assert.ok(await authSessionRepository.findActiveByHash(sha256(refreshed.refreshToken)));

  // reusing the old refresh token now fails
  await assert.rejects(
    () => service.refresh(login.refreshToken),
    (err) => err.statusCode === 401,
  );
});

test('forgotPassword is enumeration-safe and only enqueues when the user exists', async () => {
  const user = await makeUser();
  const { service, backgroundJobRepository, passwordTokenRepository } = await buildService({ users: [user] });

  const unknown = await service.forgotPassword({ identifier: 'nobody@aives.local' });
  const known = await service.forgotPassword({ identifier: 'user@aives.local' });
  assert.deepEqual(unknown, known);

  assert.equal(backgroundJobRepository.jobs.length, 1);
  const job = backgroundJobRepository.jobs[0];
  assert.equal(job.type, 'SEND_EMAIL');
  assert.equal(job.payload.to, 'user@aives.local');
  assert.equal(passwordTokenRepository.tokens.filter((t) => t.purpose === 'RESET').length, 1);
});

test('resetPassword consumes a single-use token and rejects reuse', async () => {
  const user = await makeUser();
  const ctx = await buildService({ users: [user] });
  const { service, passwordTokenRepository } = ctx;

  await service.forgotPassword({ identifier: 'user@aives.local' });
  // We cannot read the raw token (only its hash is stored), so mint our own.
  const raw = 'raw-reset-token-value';
  await passwordTokenRepository.create({
    userId: 1,
    tokenHash: sha256(raw),
    purpose: 'RESET',
    expiresAt: new Date(Date.now() + 60_000),
  });

  const result = await service.resetPassword({ token: raw, password: 'brand-new-pass' });
  assert.equal(result.ok, true);

  const user2 = await ctx.appUserRepository.findById(1);
  assert.equal(await passwordHasher.verify('brand-new-pass', user2.password_hash), true);

  // reuse must be rejected
  await assert.rejects(
    () => service.resetPassword({ token: raw, password: 'another-pass' }),
    (err) => {
      assert.equal(err.statusCode, 400);
      return true;
    },
  );
});

test('setPassword clears must_change_password', async () => {
  const user = await makeUser({ must_change_password: true, password_hash: null });
  const ctx = await buildService({ users: [user] });
  const { service, passwordTokenRepository } = ctx;
  const raw = 'raw-set-token';
  await passwordTokenRepository.create({
    userId: 1,
    tokenHash: sha256(raw),
    purpose: 'SET',
    expiresAt: new Date(Date.now() + 60_000),
  });

  await service.setPassword({ token: raw, password: 'initial-password' });
  const updated = await ctx.appUserRepository.findById(1);
  assert.equal(updated.must_change_password, false);
  assert.equal(await passwordHasher.verify('initial-password', updated.password_hash), true);
});

test('changePassword verifies the current password and revokes other sessions', async () => {
  const user = await makeUser();
  const ctx = await buildService({ users: [user] });
  const { service, authSessionRepository } = ctx;
  const login = await service.login({ identifier: 'user@aives.local', password: 'correct-password' });
  // a second session exists
  await service.login({ identifier: 'user@aives.local', password: 'correct-password' });
  assert.equal(authSessionRepository.activeCount(1), 2);

  await assert.rejects(
    () => service.changePassword(1, { currentPassword: 'wrong', newPassword: 'new-password' }),
    (err) => err.statusCode === 400,
  );

  await service.changePassword(
    1,
    { currentPassword: 'correct-password', newPassword: 'new-password' },
    { keepRefreshToken: login.refreshToken },
  );
  // only the kept session remains
  assert.equal(authSessionRepository.activeCount(1), 1);
  assert.ok(await authSessionRepository.findActiveByHash(sha256(login.refreshToken)));
});

test('logout is idempotent', async () => {
  const user = await makeUser();
  const { service } = await buildService({ users: [user] });
  const login = await service.login({ identifier: 'user@aives.local', password: 'correct-password' });
  assert.deepEqual(await service.logout(login.refreshToken), { ok: true });
  assert.deepEqual(await service.logout(login.refreshToken), { ok: true });
  assert.deepEqual(await service.logout(undefined), { ok: true });
});

test('failed logins outside the window restart the count instead of accumulating', async () => {
  let now = new Date('2024-01-01T00:00:00Z');
  const user = await makeUser();
  const { service, appUserRepository } = await buildService({ users: [user], clock: () => now });
  const fail = () => assert.rejects(
    () => service.login({ identifier: 'user@aives.local', password: 'wrong' }),
    (err) => err.statusCode === 401,
  );

  for (let i = 0; i < 4; i += 1) await fail();
  assert.equal((await appUserRepository.findById(1)).failed_login_count, 4);

  now = new Date(now.getTime() + 16 * 60 * 1000); // window (15 min) elapsed
  await fail();
  const stored = await appUserRepository.findById(1);
  assert.equal(stored.failed_login_count, 1);
  assert.equal(stored.locked_until, null);
});

test('concurrent wrong passwords all count towards the lockout', async () => {
  const now = new Date('2024-01-01T00:00:00Z');
  const user = await makeUser();
  const { service, appUserRepository } = await buildService({ users: [user], clock: () => now });
  await Promise.allSettled(Array.from({ length: 5 }, () => service.login({
    identifier: 'user@aives.local', password: 'wrong',
  })));
  const stored = await appUserRepository.findById(1);
  assert.equal(stored.failed_login_count, 5);
  assert.ok(stored.locked_until);
});

test('a reset token can be consumed only once, even by parallel requests', async () => {
  const user = await makeUser({ failed_login_count: 5, locked_until: new Date(Date.now() + 600000) });
  const { service, passwordTokenRepository, appUserRepository } = await buildService({ users: [user] });
  await passwordTokenRepository.create({
    userId: 1,
    tokenHash: sha256('raw-reset-token'),
    purpose: 'RESET',
    expiresAt: new Date(Date.now() + 600000),
  });
  const results = await Promise.allSettled([
    service.resetPassword({ token: 'raw-reset-token', password: 'brand-new-password' }),
    service.resetPassword({ token: 'raw-reset-token', password: 'another-new-password' }),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  const rejected = results.find((r) => r.status === 'rejected');
  assert.equal(rejected.reason.code, 'INVALID_TOKEN');

  // The reset also lifts the lockout.
  const stored = await appUserRepository.findById(1);
  assert.equal(stored.failed_login_count, 0);
  assert.equal(stored.locked_until, null);
});

test('a replayed refresh token cannot mint a second session', async () => {
  const user = await makeUser();
  const { service, authSessionRepository } = await buildService({ users: [user] });
  const login = await service.login({ identifier: 'user@aives.local', password: 'correct-password' });
  const results = await Promise.allSettled([
    service.refresh(login.refreshToken),
    service.refresh(login.refreshToken),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(authSessionRepository.activeCount(1), 1);
});
