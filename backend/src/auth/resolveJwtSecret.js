const DEV_FALLBACK_SECRET = 'aives-dev-insecure-secret';

/**
 * Resolve the JWT signing secret for the TokenService.
 *
 * In a real deployment (awsMockMode === false) a missing or blank JWT_SECRET is
 * a hard startup failure: we throw an Error carrying code 'JWT_SECRET_REQUIRED'
 * so the process never boots with the insecure dev placeholder. In mock/dev/
 * test environments (awsMockMode === true) we fall back to the non-production
 * placeholder so createApp works without JWT_SECRET set.
 */
function resolveJwtSecret(runtimeEnv = {}) {
  const secret = runtimeEnv.jwtSecret;
  const isBlank = !secret || String(secret).trim() === '';
  if (runtimeEnv.awsMockMode === false && isBlank) {
    const err = new Error('JWT_SECRET must be set in a non-mock (production) environment.');
    err.code = 'JWT_SECRET_REQUIRED';
    throw err;
  }
  return secret || DEV_FALLBACK_SECRET;
}

module.exports = { resolveJwtSecret, DEV_FALLBACK_SECRET };
