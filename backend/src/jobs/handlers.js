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

// Minimum extracted characters for a document to count as having a real text
// layer. Below this we treat it as a scanned/image-only file and mark FAILED
// without throwing (no amount of retrying will add a text layer).
const MIN_EXTRACTED_CHARS = 20;

/**
 * Build the INGEST_MATERIAL handler. Downloads the uploaded file from S3,
 * parses it into segments, chunks + embeds each chunk, then atomically replaces
 * the material's chunks, persists the page count (Finding 1), and flips status
 * to READY. Terminal/content problems (no text layer, parse failure) mark the
 * material FAILED and resolve WITHOUT throwing so the queue does not retry;
 * transient problems (missing object in S3, embedding error) rethrow so the
 * queue retries with backoff.
 */
function makeIngestMaterialHandler({
  db,
  courseMaterialRepository,
  materialChunkRepository,
  embeddingAdapter,
  awsClients,
  parse,
  env,
  logger = console,
}) {
  const { chunkSegments } = require('../ingest/chunkText');
  const bucket = (env && env.materialsBucket) || 'local-materials-bucket';

  return async function ingestMaterialHandler(job) {
    const materialId = job && job.payload ? job.payload.materialId : undefined;
    const material = await courseMaterialRepository.findById(materialId);
    if (!material) {
      throw new Error(`INGEST_MATERIAL: material ${materialId} not found`);
    }
    if (material.status === 'READY') {
      logger.info({ jobId: job.background_job_id, materialId }, 'material already READY; skipping');
      return;
    }

    const subjectId = material.subject_id;
    await courseMaterialRepository.updateStatus(materialId, 'PROCESSING', null);

    // Download then parse. A parse failure is a terminal content problem.
    const buffer = await awsClients.getObject({ bucket, key: material.file_key });

    let parsed;
    try {
      parsed = await parse(material.mime_type, buffer);
    } catch (err) {
      logger.warn({ jobId: job.background_job_id, materialId, err }, 'parse failed; marking FAILED');
      await courseMaterialRepository.updateStatus(materialId, 'FAILED', 'Could not parse the document.');
      return;
    }

    const { segments, pageCount } = parsed;
    const extractedChars = (segments || [])
      .reduce((sum, seg) => sum + String(seg && seg.text ? seg.text : '').length, 0);
    if (extractedChars < MIN_EXTRACTED_CHARS) {
      logger.warn({ jobId: job.background_job_id, materialId }, 'no text layer; marking FAILED');
      await courseMaterialRepository.updateStatus(
        materialId,
        'FAILED',
        'This document needs a text layer; no extractable text was found.',
      );
      return;
    }

    const chunks = chunkSegments(segments);
    // Embed each chunk sequentially; an embedding error is transient -> rethrow.
    for (const chunk of chunks) {
      chunk.embedding = await embeddingAdapter.embed(chunk.content);
    }

    await db.withTransaction(async (tx) => {
      await materialChunkRepository.deleteByMaterial(materialId, tx);
      await materialChunkRepository.insertMany(materialId, subjectId, chunks, tx);
      await courseMaterialRepository.setPageCount(materialId, pageCount, tx);
      await courseMaterialRepository.updateStatus(materialId, 'READY', null, tx);
    });

    logger.info(
      { jobId: job.background_job_id, materialId, chunks: chunks.length, pageCount },
      'material ingested',
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

  // Build the real INGEST_MATERIAL handler only when a transactional DB and the
  // ingestion deps are present (the server.js DB branch spreads app.jobContext
  // in). Otherwise fall back to the no-op stub so the queue stays functional.
  const canBuildHandlers = !!(deps.db && typeof deps.db.withTransaction === 'function');
  if (canBuildHandlers && deps.courseMaterialRepository && deps.materialChunkRepository
      && deps.embeddingAdapter && deps.awsClients && deps.parse) {
    queue.registerHandler('INGEST_MATERIAL', makeIngestMaterialHandler({
      db: deps.db,
      courseMaterialRepository: deps.courseMaterialRepository,
      materialChunkRepository: deps.materialChunkRepository,
      embeddingAdapter: deps.embeddingAdapter,
      awsClients: deps.awsClients,
      parse: deps.parse,
      env: deps.env,
      logger,
    }));
  } else {
    queue.registerHandler('INGEST_MATERIAL', makeStubHandler('INGEST_MATERIAL', logger));
  }

  // GENERATE_QUESTIONS / GRADE_INTERVIEW remain stubs until later features.
  const stubTypes = ['GENERATE_QUESTIONS', 'GRADE_INTERVIEW'];
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
  makeIngestMaterialHandler,
  MIN_EXTRACTED_CHARS,
};
