const { sha256, randomToken } = require('../auth/tokenService');

function authError(statusCode, code, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.code = code;
  return err;
}

function toSafeUser(user) {
  if (!user) return null;
  return {
    id: user.app_user_id,
    code: user.code ?? null,
    email: user.email,
    fullName: user.full_name ?? null,
    role: user.role,
    status: user.status,
    mustChangePassword: user.must_change_password === true,
    lastLoginAt: user.last_login_at ?? null,
  };
}

class AuthService {
  constructor({
    appUserRepository,
    authSessionRepository,
    passwordTokenRepository,
    backgroundJobRepository,
    passwordHasher,
    tokenService,
    env,
    clock,
  }) {
    this.appUserRepository = appUserRepository;
    this.authSessionRepository = authSessionRepository;
    this.passwordTokenRepository = passwordTokenRepository;
    this.backgroundJobRepository = backgroundJobRepository;
    this.passwordHasher = passwordHasher;
    this.tokenService = tokenService;
    this.env = env;
    this.clock = clock || (() => new Date());
  }

  _now() {
    return this.clock();
  }

  async _mintSession(user, { ip, userAgent } = {}) {
    const access = this.tokenService.signAccess({ sub: user.app_user_id, role: user.role });
    const refresh = this.tokenService.signRefresh({ sub: user.app_user_id, role: user.role });
    const expiresAt = new Date((refresh.payload.exp) * 1000);
    await this.authSessionRepository.create({
      userId: user.app_user_id,
      refreshTokenHash: sha256(refresh.token),
      expiresAt,
      ip,
      userAgent,
    });
    return { accessToken: access.token, refreshToken: refresh.token };
  }

  async login({ identifier, password }, { ip, userAgent } = {}) {
    if (!identifier || !password) {
      throw authError(400, 'VALIDATION_ERROR', 'Identifier and password are required.');
    }
    const user = await this.appUserRepository.findByEmailOrCode(String(identifier).trim());
    const invalid = () => authError(401, 'INVALID_CREDENTIALS', 'Invalid credentials.');

    if (!user || user.status === 'DELETED') throw invalid();

    const now = this._now();
    if (user.locked_until && new Date(user.locked_until) > now) {
      throw authError(423, 'ACCOUNT_LOCKED', 'Account is temporarily locked. Try again later.');
    }
    if (user.status === 'LOCKED') {
      throw authError(423, 'ACCOUNT_LOCKED', 'Account is locked.');
    }

    const ok = user.password_hash
      ? await this.passwordHasher.verify(password, user.password_hash)
      : false;

    if (!ok) {
      await this._registerFailure(user, now);
      throw invalid();
    }

    // Success: reset counters, record login time.
    await this.appUserRepository.update(user.app_user_id, {
      failed_login_count: 0,
      first_failed_at: null,
      locked_until: null,
      last_login_at: now,
    });

    const tokens = await this._mintSession(user, { ip, userAgent });
    return { user: toSafeUser(user), ...tokens };
  }

  // Counting and locking happen in one atomic repository call so concurrent
  // wrong guesses cannot all read the same stale count.
  async _registerFailure(user, now) {
    await this.appUserRepository.registerLoginFailure(user.app_user_id, {
      now,
      windowMs: this.env.loginWindowMinutes * 60 * 1000,
      maxFailures: this.env.loginMaxFailures,
      lockMs: this.env.loginLockMinutes * 60 * 1000,
    });
  }

  async refresh(refreshToken, { ip, userAgent } = {}) {
    if (!refreshToken) {
      throw authError(401, 'UNAUTHORIZED', 'Missing refresh token.');
    }
    const payload = this.tokenService.verify(refreshToken, { type: 'refresh' });
    const hash = sha256(refreshToken);
    const session = await this.authSessionRepository.findActiveByHash(hash);
    if (!session) {
      throw authError(401, 'UNAUTHORIZED', 'Refresh session is no longer valid.');
    }
    const user = await this.appUserRepository.findById(payload.sub);
    if (!user || user.status !== 'ACTIVE') {
      throw authError(401, 'UNAUTHORIZED', 'User is not available.');
    }
    // Rotate: atomically revoke the old session. If another request already
    // consumed this refresh token, revoke() matches nothing and we refuse
    // rather than minting a second session from a replayed token.
    const revoked = await this.authSessionRepository.revoke(hash);
    if (!revoked) {
      throw authError(401, 'UNAUTHORIZED', 'Refresh session is no longer valid.');
    }
    const tokens = await this._mintSession(user, { ip, userAgent });
    return { user: toSafeUser(user), ...tokens };
  }

  async logout(refreshToken) {
    if (!refreshToken) return { ok: true };
    await this.authSessionRepository.revoke(sha256(refreshToken));
    return { ok: true };
  }

  async me(userId) {
    const user = await this.appUserRepository.findById(userId);
    if (!user) throw authError(404, 'NOT_FOUND', 'User not found.');
    return toSafeUser(user);
  }

  /**
   * Enumeration-safe: always returns the same shape regardless of whether the
   * identifier matches a user. Only enqueues an email when a user is found.
   */
  async forgotPassword({ identifier }) {
    const response = { ok: true };
    if (!identifier) return response;
    const user = await this.appUserRepository.findByEmailOrCode(String(identifier).trim());
    if (!user || user.status === 'DELETED') return response;

    await this.passwordTokenRepository.invalidateActiveForUser(user.app_user_id, 'RESET');
    const rawToken = randomToken(32);
    const expiresAt = new Date(this._now().getTime() + this.env.passwordResetTtlMinutes * 60 * 1000);
    await this.passwordTokenRepository.create({
      userId: user.app_user_id,
      tokenHash: sha256(rawToken),
      purpose: 'RESET',
      expiresAt,
    });
    await this._enqueuePasswordEmail({ user, rawToken, purpose: 'RESET' });
    return response;
  }

  async resetPassword({ token, password }) {
    return this._consumePasswordToken({ token, password, purpose: 'RESET' });
  }

  async setPassword({ token, password }) {
    return this._consumePasswordToken({ token, password, purpose: 'SET', clearMustChange: true });
  }

  async _consumePasswordToken({ token, password, purpose, clearMustChange = false }) {
    if (!token) {
      throw authError(400, 'VALIDATION_ERROR', 'Token is required.');
    }
    this.passwordHasher.assertStrong(password);
    const record = await this.passwordTokenRepository.findActiveByHash(sha256(token), purpose);
    if (!record) {
      throw authError(400, 'INVALID_TOKEN', 'This link is invalid or has expired.');
    }
    const passwordHash = await this.passwordHasher.hash(password);
    // Claim the single-use token first. markUsed is conditional on used_at IS
    // NULL, so of two parallel requests only one gets the row back.
    const claimed = await this.passwordTokenRepository.markUsed(record.password_token_id);
    if (!claimed) {
      throw authError(400, 'INVALID_TOKEN', 'This link is invalid or has expired.');
    }
    // A fresh password also clears any failed-login lockout.
    const patch = {
      password_hash: passwordHash,
      failed_login_count: 0,
      first_failed_at: null,
      locked_until: null,
    };
    if (clearMustChange) patch.must_change_password = false;
    await this.appUserRepository.update(record.user_id, patch);
    // Invalidate all existing sessions so a password change forces re-login.
    await this.authSessionRepository.revokeAllForUser(record.user_id);
    return { ok: true };
  }

  async changePassword(userId, { currentPassword, newPassword }, { keepRefreshToken } = {}) {
    const user = await this.appUserRepository.findById(userId);
    if (!user) throw authError(404, 'NOT_FOUND', 'User not found.');
    const ok = user.password_hash
      ? await this.passwordHasher.verify(currentPassword, user.password_hash)
      : false;
    if (!ok) {
      throw authError(400, 'INVALID_CREDENTIALS', 'Current password is incorrect.');
    }
    this.passwordHasher.assertStrong(newPassword);
    const passwordHash = await this.passwordHasher.hash(newPassword);
    await this.appUserRepository.update(userId, {
      password_hash: passwordHash,
      must_change_password: false,
    });
    // Revoke other sessions; optionally keep the caller's current session.
    const exceptHash = keepRefreshToken ? sha256(keepRefreshToken) : undefined;
    await this.authSessionRepository.revokeAllForUser(userId, { exceptHash });
    return { ok: true };
  }

  async _enqueuePasswordEmail({ user, rawToken, purpose }) {
    const base = this.env.appBaseUrl.replace(/\/+$/, '');
    const pathSegment = purpose === 'SET' ? 'set-password' : 'reset-password';
    const link = `${base}/${pathSegment}?token=${encodeURIComponent(rawToken)}`;
    const subject = purpose === 'SET'
      ? 'Set your AIVES password'
      : 'Reset your AIVES password';
    await this.backgroundJobRepository.enqueue('SEND_EMAIL', {
      to: user.email,
      template: purpose === 'SET' ? 'SET_PASSWORD' : 'RESET_PASSWORD',
      subject,
      variables: {
        fullName: user.full_name ?? null,
        link,
        purpose,
      },
    });
  }
}

module.exports = { AuthService, toSafeUser };
