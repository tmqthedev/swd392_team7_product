const test = require('node:test');
const assert = require('node:assert/strict');

const { JobQueue } = require('../src/jobs/jobQueue');
const { registerDefaultHandlers, makeSendEmailHandler } = require('../src/jobs/handlers');

const silentLogger = { info() {}, warn() {}, error() {} };

function makeEmailService() {
  const calls = [];
  return {
    calls,
    async sendMail(msg) {
      calls.push(msg);
      return { messageId: `mock-${calls.length}` };
    },
  };
}

test('SEND_EMAIL handler maps an explicit payload to emailService.sendMail', async () => {
  const emailService = makeEmailService();
  const handler = makeSendEmailHandler(emailService, silentLogger);
  await handler({
    background_job_id: 1,
    payload: { to: 'a@b.c', subject: 'Hi', html: '<p>x</p>', text: 'x' },
  });
  assert.equal(emailService.calls.length, 1);
  assert.deepEqual(emailService.calls[0], {
    to: 'a@b.c', subject: 'Hi', html: '<p>x</p>', text: 'x',
  });
});

test('SEND_EMAIL handler renders body from the enqueue template contract', async () => {
  const emailService = makeEmailService();
  const handler = makeSendEmailHandler(emailService, silentLogger);
  await handler({
    background_job_id: 2,
    payload: {
      to: 'student@aives.local',
      template: 'SET_PASSWORD',
      subject: 'Set your AIVES password',
      variables: { link: 'http://localhost:8080/set-password?token=abc', purpose: 'SET' },
    },
  });
  assert.equal(emailService.calls.length, 1);
  const sent = emailService.calls[0];
  assert.equal(sent.to, 'student@aives.local');
  assert.ok(sent.html.includes('set-password?token=abc'));
  assert.ok(sent.text.includes('set-password?token=abc'));
});

test('SEND_EMAIL handler rethrows on send failure so the queue retries', async () => {
  const failing = {
    async sendMail() { throw new Error('smtp down'); },
  };
  const handler = makeSendEmailHandler(failing, silentLogger);
  await assert.rejects(
    () => handler({ background_job_id: 3, payload: { to: 'a@b.c', subject: 's', html: 'h', text: 't' } }),
    (err) => err.message === 'smtp down',
  );
});

test('a failing SEND_EMAIL job is re-queued for retry by the JobQueue', async () => {
  const failing = { async sendMail() { throw new Error('smtp down'); } };
  const markFailedCalls = [];
  const repository = {
    async markDone() {},
    async markFailed(id, errText, nextRunAfter) {
      markFailedCalls.push({ id, errText, nextRunAfter });
    },
  };
  const queue = new JobQueue({ db: null, repository, env: { jobMaxAttempts: 3 }, logger: silentLogger });
  registerDefaultHandlers(queue, { logger: silentLogger, emailService: failing });

  // attempts (1) < maxAttempts (3) => scheduled for retry with a future run_after.
  await queue._process({ background_job_id: 9, type: 'SEND_EMAIL', attempts: 1, max_attempts: 3, payload: { to: 'a@b.c' } });
  assert.equal(markFailedCalls.length, 1);
  assert.ok(markFailedCalls[0].nextRunAfter instanceof Date);
});

test('registerDefaultHandlers falls back to a no-op SEND_EMAIL when no mailer given', async () => {
  const queue = new JobQueue({ db: null, repository: {}, env: {}, logger: silentLogger });
  registerDefaultHandlers(queue, { logger: silentLogger });
  assert.ok(queue.handlers.has('SEND_EMAIL'));
  // No throw when invoked without an emailService.
  await queue.handlers.get('SEND_EMAIL')({ background_job_id: 1 });
});
