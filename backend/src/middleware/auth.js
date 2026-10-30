const { ACCESS_COOKIE } = require('../auth/cookieNames');

function unauthorized(message = 'Authentication required.') {
  const err = new Error(message);
  err.statusCode = 401;
  err.code = 'UNAUTHORIZED';
  return err;
}

function forbidden(message = 'You do not have access to this resource.') {
  const err = new Error(message);
  err.statusCode = 403;
  err.code = 'FORBIDDEN';
  return err;
}

/**
 * Build the auth middleware set: requireAuth and requireRole. Subject scope is
 * enforced in services (services/subjectScope.js), because most routes only
 * learn the subject after loading the resource.
 */
function createAuthMiddleware({ tokenService, env, appUserRepository }) {
  function readAccessToken(req) {
    if (req.cookies && req.cookies[ACCESS_COOKIE]) {
      return req.cookies[ACCESS_COOKIE];
    }
    const header = req.headers && req.headers.authorization;
    if (header && header.startsWith('Bearer ')) {
      return header.slice('Bearer '.length).trim();
    }
    return null;
  }

  async function requireAuth(req, _res, next) {
    try {
      const token = readAccessToken(req);
      if (!token) throw unauthorized();
      const payload = tokenService.verify(token, { type: 'access' });
      req.auth = { userId: payload.sub, role: payload.role, jti: payload.jti };
      req.user = { id: payload.sub, role: payload.role };
      next();
    } catch (err) {
      if (!err.statusCode) err.statusCode = 401;
      next(err);
    }
  }

  function requireRole(...roles) {
    const allowed = roles.flat();
    return (req, _res, next) => {
      if (!req.user) return next(unauthorized());
      if (!allowed.includes(req.user.role)) return next(forbidden());
      next();
    };
  }

  return { requireAuth, requireRole };
}

module.exports = { createAuthMiddleware };
