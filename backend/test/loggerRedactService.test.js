const test = require('node:test');
const assert = require('node:assert/strict');
const { Writable } = require('node:stream');
const { createLogger } = require('../src/config/logger');

test('request logs redact cookies, authorization and Set-Cookie', () => {
  const lines = [];
  const sink = new Writable({
    write(chunk, _enc, cb) {
      lines.push(JSON.parse(chunk.toString()));
      cb();
    },
  });
  const logger = createLogger({ level: 'info' }, sink);
  logger.info({
    req: { method: 'POST', url: '/api/topics', headers: { cookie: 'aives_access=jwt', authorization: 'Bearer x', origin: 'o' } },
    res: { statusCode: 200, headers: { 'set-cookie': ['aives_refresh=jwt'] } },
  }, 'request completed');

  const [entry] = lines;
  assert.equal(entry.req.headers.cookie, '[REDACTED]');
  assert.equal(entry.req.headers.authorization, '[REDACTED]');
  assert.equal(entry.res.headers['set-cookie'], '[REDACTED]');
  assert.equal(entry.req.headers.origin, 'o');
});
