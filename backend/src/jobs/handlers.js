// Background job handlers. INGEST_MATERIAL / GENERATE_QUESTIONS /
// GRADE_INTERVIEW remain no-op stubs (implemented in later work); SEND_EMAIL is
// a real handler that sends via the injected emailService and THROWS on failure
// so the queue retries with backoff.

const {
  renderSetPasswordEmail,
  renderResetPasswordEmail,
} = require('../services/emailService');

function makeStubHandler(type, logger) {
  return async function stubHandler(job) {
    logger.info(
      { jobId: job.background_job_id, type },
      'stub handler invoked (no-op)',
    );
  };
}

/**
 * Build the SEND_EMAIL handler. Reads job.payload and sends through
 * emailService. The payload may carry a ready-made {to,subject,html,text} or
 * the enqueue contract {to,subject,template,variables:{link,...}} produced by
 * authService; in the latter case the body is rendered from the template.
 * Rethrows on any send failure so the queue schedules a retry.
 */
function makeSendEmailHandler(emailService, logger) {
  return async function sendEmailHandler(job) {
    const payload = job.payload || {};
    const { to, template, variables } = payload;
    let { subject, html, text } = payload;

    if ((!html || !text) && template) {
      const link = variables && variables.link;
      const rendered = template === 'SET_PASSWORD'
        ? renderSetPasswordEmail(link)
        : renderResetPasswordEmail(link);
      subject = subject || rendered.subject;
      html = html || rendered.html;
      text = text || rendered.text;
    }

    if (!to) {
      throw new Error('SEND_EMAIL payload is missing a recipient (to).');
    }

    try {
      await emailService.sendMail({ to, subject, html, text });
      logger.info({ jobId: job.background_job_id, to }, 'email sent');
    } catch (err) {
      // Rethrow so JobQueue marks the job for retry with backoff.
      logger.error({ jobId: job.background_job_id, err }, 'email send failed');
      throw err;
    }
  };
}

/**
 * Register handlers for every job type on the queue.
 * @param {import('./jobQueue').JobQueue} queue
 * @param {{logger?: object, emailService?: object}} [deps]
 */
function registerDefaultHandlers(queue, deps = {}) {
  const logger = deps.logger || queue.logger || console;
  const stubTypes = ['INGEST_MATERIAL', 'GENERATE_QUESTIONS', 'GRADE_INTERVIEW'];
  for (const type of stubTypes) {
    queue.registerHandler(type, makeStubHandler(type, logger));
  }
  if (deps.emailService) {
    queue.registerHandler('SEND_EMAIL', makeSendEmailHandler(deps.emailService, logger));
  } else {
    // No mailer configured (e.g. mock mode): keep the queue functional.
    queue.registerHandler('SEND_EMAIL', makeStubHandler('SEND_EMAIL', logger));
  }
  return queue;
}

module.exports = {
  registerDefaultHandlers,
  makeStubHandler,
  makeSendEmailHandler,
};
