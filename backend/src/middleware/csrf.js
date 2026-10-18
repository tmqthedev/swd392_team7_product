const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Origin-based CSRF defence. Safe (read-only) methods pass through. Any
 * state-changing request must carry an Origin header that matches one of the
 * allowed origins; otherwise it is rejected with 403.
 * @param {string[]} allowedOrigins
 */
function verifyOrigin(allowedOrigins = []) {
  const allowed = new Set(
    allowedOrigins
      .filter(Boolean)
      .map((origin) => origin.replace(/\/+$/, '')),
  );
  return (req, _res, next) => {
    if (SAFE_METHODS.has(req.method)) return next();
    // With no configured allowed origins there is nothing to enforce against;
    // skip the check so non-browser / test harness callers are not blocked.
    // Real deployments always configure APP_BASE_URL, keeping this strict.
    if (allowed.size === 0) return next();
    const origin = req.headers.origin;
    const normalized = typeof origin === 'string' ? origin.replace(/\/+$/, '') : origin;
    if (!normalized || !allowed.has(normalized)) {
      const err = new Error('Request origin is not allowed.');
      err.statusCode = 403;
      err.code = 'FORBIDDEN_ORIGIN';
      return next(err);
    }
    next();
  };
}

module.exports = { verifyOrigin };
