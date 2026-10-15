const { ACCESS_COOKIE, REFRESH_COOKIE } = require('../auth/cookieNames');

class AuthController {
  constructor(service, { env }) {
    this.service = service;
    this.env = env;
  }

  _baseCookieOptions() {
    return {
      httpOnly: true,
      secure: this.env.cookieSecure,
      sameSite: this.env.cookieSameSite,
      path: '/',
    };
  }

  _setAuthCookies(res, { accessToken, refreshToken }) {
    const base = this._baseCookieOptions();
    res.cookie(ACCESS_COOKIE, accessToken, {
      ...base,
      maxAge: this.env.jwtAccessTtlSec * 1000,
    });
    res.cookie(REFRESH_COOKIE, refreshToken, {
      ...base,
      maxAge: this.env.jwtRefreshTtlSec * 1000,
    });
  }

  _clearAuthCookies(res) {
    const base = this._baseCookieOptions();
    res.clearCookie(ACCESS_COOKIE, base);
    res.clearCookie(REFRESH_COOKIE, base);
  }

  _reqMeta(req) {
    return {
      ip: req.ip,
      userAgent: req.headers['user-agent'] || null,
    };
  }

  async login(req, res, next) {
    try {
      const { identifier, email, code, password } = req.body || {};
      const result = await this.service.login(
        { identifier: identifier || email || code, password },
        this._reqMeta(req),
      );
      this._setAuthCookies(res, result);
      res.json({ user: result.user });
    } catch (err) { next(err); }
  }

  async refresh(req, res, next) {
    try {
      const refreshToken = req.cookies ? req.cookies[REFRESH_COOKIE] : null;
      const result = await this.service.refresh(refreshToken, this._reqMeta(req));
      this._setAuthCookies(res, result);
      res.json({ user: result.user });
    } catch (err) { next(err); }
  }

  async logout(req, res, next) {
    try {
      const refreshToken = req.cookies ? req.cookies[REFRESH_COOKIE] : null;
      await this.service.logout(refreshToken);
      this._clearAuthCookies(res);
      res.status(204).end();
    } catch (err) { next(err); }
  }

  async me(req, res, next) {
    try {
      const user = await this.service.me(req.user.id);
      res.json({ user });
    } catch (err) { next(err); }
  }

  async forgotPassword(req, res, next) {
    try {
      const { identifier, email, code } = req.body || {};
      const result = await this.service.forgotPassword({ identifier: identifier || email || code });
      res.json(result);
    } catch (err) { next(err); }
  }

  async resetPassword(req, res, next) {
    try {
      const { token, password } = req.body || {};
      const result = await this.service.resetPassword({ token, password });
      res.json(result);
    } catch (err) { next(err); }
  }

  async setPassword(req, res, next) {
    try {
      const { token, password } = req.body || {};
      const result = await this.service.setPassword({ token, password });
      res.json(result);
    } catch (err) { next(err); }
  }

  async changePassword(req, res, next) {
    try {
      const { currentPassword, newPassword } = req.body || {};
      const refreshToken = req.cookies ? req.cookies[REFRESH_COOKIE] : null;
      const result = await this.service.changePassword(
        req.user.id,
        { currentPassword, newPassword },
        { keepRefreshToken: refreshToken },
      );
      res.json(result);
    } catch (err) { next(err); }
  }
}

module.exports = { AuthController };
