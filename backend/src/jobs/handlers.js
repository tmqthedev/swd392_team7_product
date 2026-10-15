// No-op stub handlers for the four background job types. Real ingest /
// generation / grading / email logic is implemented in later steps; these only
// log and resolve so the queue mechanism can be exercised end to end.

function makeStubHandler(type, logger) {
  return async function stubHandler(job) {
    logger.info(
      { jobId: job.background_job_id, type },
      'stub handler invoked (no-op)',
    );
  };
}

/**
 * Register no-op handlers for every job type on the queue.
 * @param {import('./jobQueue').JobQueue} queue
 * @param {{logger?: object}} [deps]
 */
function registerDefaultHandlers(queue, deps = {}) {
  const logger = deps.logger || queue.logger || console;
  const types = ['INGEST_MATERIAL', 'GENERATE_QUESTIONS', 'GRADE_INTERVIEW', 'SEND_EMAIL'];
  for (const type of types) {
    queue.registerHandler(type, makeStubHandler(type, logger));
  }
  return queue;
}

module.exports = {
  registerDefaultHandlers,
  makeStubHandler,
};
