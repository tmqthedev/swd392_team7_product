// Shared pino options. Request logs must never carry credentials: the access
// and refresh JWTs travel in cookies, so cookie/authorization headers and the
// Set-Cookie response header are redacted.

const pino = require('pino');

const LOG_REDACT_PATHS = [
  'req.headers.cookie',
  'req.headers.authorization',
  'res.headers["set-cookie"]',
];

function createLogger(options = {}, destination) {
  return pino(
    {
      level: process.env.LOG_LEVEL || 'info',
      redact: { paths: LOG_REDACT_PATHS, censor: '[REDACTED]' },
      ...options,
    },
    destination,
  );
}

module.exports = { createLogger, LOG_REDACT_PATHS };
