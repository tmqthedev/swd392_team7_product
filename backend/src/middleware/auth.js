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
 * Build the auth middleware set. Exposes requireAuth, requireRole, and
 * requireSubjectScope so later features can reuse the same authorization logic.
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

  /**
   * Guard access to a subject-scoped resource. ADMIN bypasses the check;
   * LECTURER must be assigned to the subject; everyone else is denied.
   * @param {{param?: string, subjectRepository: object}} options
   */
  function requireSubjectScope({ param = 'subjectId', subjectRepository }) {
    return async (req, _res, next) => {
      try {
        if (!req.user) throw unauthorized();
        if (req.user.role === 'ADMIN') return next();
        if (req.user.role !== 'LECTURER') throw forbidden();

        const subjectId = Number(req.params[param]);
        if (!Number.isInteger(subjectId) || subjectId <= 0) {
          const err = new Error('A valid subject id is required.');
          err.statusCode = 400;
          err.code = 'VALIDATION_ERROR';
          throw err;
        }
        const subjectIds = await subjectRepository.listSubjectIdsForLecturer(req.user.id);
        if (!subjectIds.includes(subjectId)) throw forbidden();
        next();
      } catch (err) {
        next(err);
      }
    };
  }

  return { requireAuth, requireRole, requireSubjectScope };
}

module.exports = { createAuthMiddleware };
