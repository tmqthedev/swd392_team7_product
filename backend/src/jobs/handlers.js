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
 * Build the GENERATE_QUESTIONS handler. Loads the generation job, embeds the
 * topic name, retrieves the nearest chunks across the job's materials (building
 * R: chunk_id -> {content,location,materialId}), calls the LLM to draft
 * questions, then delegates per-draft grounding/dedup validation + persistence
 * to QuestionGenerationService.persistDrafts. On success it writes the survivor
 * count absolutely (setGeneratedCount) and flips the domain job to COMPLETED
 * (recording the no-groundable error when zero survived); on ANY error it marks
 * the domain job FAILED then rethrows so the queue owns retry/backoff.
 */
function makeGenerateQuestionsHandler({
  db,
  questionGenerationJobRepository,
  courseMaterialRepository,
  materialChunkRepository,
  questionRepository,
  questionSourceRefRepository,
  topicRepository,
  embeddingAdapter,
  llmAdapter,
  logger = console,
}) {
  // eslint-disable-next-line global-require
  const {
    QuestionGenerationService,
    NO_GROUNDABLE_ERROR,
    RETRIEVE_LIMIT,
  } = require('../services/questionGenerationService');

  const generationService = new QuestionGenerationService({
    questionGenerationJobRepository,
    questionRepository,
    questionSourceRefRepository,
    courseMaterialRepository,
    topicRepository,
    embeddingAdapter,
    db,
    logger,
  });

  return async function generateQuestionsHandler(job) {
    const jobId = job && job.payload ? job.payload.jobId : undefined;
    const domainJob = await questionGenerationJobRepository.findById(jobId);
    if (!domainJob) {
      throw new Error(`GENERATE_QUESTIONS: job ${jobId} not found`);
    }

    try {
      await questionGenerationJobRepository.updateStatus(
        domainJob.question_generation_job_id,
        'RUNNING',
        null,
      );

      // A retried or recovered run starts clean: drop whatever an earlier
      // attempt left unreviewed so questions are not duplicated.
      if (typeof questionRepository.deleteUnreviewedByGenerationJob === 'function') {
        await questionRepository.deleteUnreviewedByGenerationJob(
          domainJob.question_generation_job_id,
        );
      }

      const topic = await topicRepository.getById(domainJob.topic_id);
      if (!topic) {
        throw new Error(`GENERATE_QUESTIONS: topic ${domainJob.topic_id} not found`);
      }

      const materialIds = parseJsonMaybe(domainJob.material_ids) || [];
      const bloomDistribution = parseJsonMaybe(domainJob.bloom_distribution);

      const queryEmbedding = await embeddingAdapter.embed(topic.name);
      const chunkRows = await materialChunkRepository.findNearestForTopic({
        materialIds,
        queryEmbedding,
        limit: RETRIEVE_LIMIT,
      });

      // R: the authoritative retrieved-chunk map. Citations are validated and
      // persisted ONLY against keys of R (Finding 4 citation-in-scope).
      const R = {};
      const chunks = [];
      for (const row of chunkRows) {
        R[row.material_chunk_id] = {
          content: row.content,
          location: row.location,
          materialId: row.material_id,
        };
        chunks.push({
          chunk_id: row.material_chunk_id,
          content: row.content,
          location: row.location,
        });
      }

      const drafts = await llmAdapter.generateQuestions({
        language: domainJob.language,
        topic: { name: topic.name },
        bloomDistribution,
        requestedCount: domainJob.requested_count,
        chunks,
      });

      const { survivors } = await generationService.persistDrafts({
        job: domainJob,
        drafts,
        R,
      });

      // Absolute write so a retried run never double-counts.
      await questionGenerationJobRepository.setGeneratedCount(
        domainJob.question_generation_job_id,
        survivors.length,
      );
      await questionGenerationJobRepository.updateStatus(
        domainJob.question_generation_job_id,
        'COMPLETED',
        survivors.length === 0 ? NO_GROUNDABLE_ERROR : null,
      );

      logger.info(
        {
          jobId: domainJob.question_generation_job_id,
          survivors: survivors.length,
          requested: domainJob.requested_count,
        },
        'question generation completed',
      );
    } catch (err) {
      logger.error(
        { jobId: domainJob.question_generation_job_id, err },
        'question generation failed',
      );
      // Only report FAILED once the queue has no retries left; while one is
      // pending keep the job RUNNING (with the last error) so the UI keeps
      // polling instead of showing a failure that may still recover.
      const attemptsLeft = job && job.attempts != null && job.max_attempts != null
        && job.attempts < job.max_attempts;
      await questionGenerationJobRepository.updateStatus(
        domainJob.question_generation_job_id,
        attemptsLeft ? 'RUNNING' : 'FAILED',
        err && err.message ? err.message : 'Question generation failed.',
      );
      // Rethrow so the queue owns retry/backoff.
      throw err;
    }
  };
}

// Parse a JSONB column that pg may return as a string (real DB) or as an
// already-parsed value (in-memory mock / fakes).
function parseJsonMaybe(value) {
  if (value == null) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
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
 * Build the GRADE_INTERVIEW handler. Reads job.payload.interviewId and calls
 * gradingService.gradeInterview. Rethrows transient errors so JobQueue can retry.
 */
function makeGradeInterviewHandler(gradingService, logger = console) {
  return async function gradeInterviewHandler(job) {
    const payload = job.payload || {};
    const { interviewId } = payload;
    if (!interviewId) {
      logger.warn({ jobId: job.background_job_id }, 'GRADE_INTERVIEW payload missing interviewId; discarding');
      return;
    }
    logger.info({ jobId: job.background_job_id, interviewId }, 'processing GRADE_INTERVIEW job');
    try {
      await gradingService.gradeInterview({ interviewId: Number(interviewId) });
      logger.info({ jobId: job.background_job_id, interviewId }, 'GRADE_INTERVIEW completed successfully');
    } catch (err) {
      logger.error({ jobId: job.background_job_id, interviewId, err }, 'GRADE_INTERVIEW failed');
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

  // Build the real GENERATE_QUESTIONS handler only when a transactional DB and
  // its deps are present (server.js spreads app.jobContext in). Otherwise fall
  // back to the no-op stub so the queue stays functional.
  if (canBuildHandlers && deps.questionGenerationJobRepository && deps.courseMaterialRepository
      && deps.materialChunkRepository && deps.questionRepository && deps.questionSourceRefRepository
      && deps.topicRepository && deps.embeddingAdapter && deps.llmAdapter) {
    queue.registerHandler('GENERATE_QUESTIONS', makeGenerateQuestionsHandler({
      db: deps.db,
      questionGenerationJobRepository: deps.questionGenerationJobRepository,
      courseMaterialRepository: deps.courseMaterialRepository,
      materialChunkRepository: deps.materialChunkRepository,
      questionRepository: deps.questionRepository,
      questionSourceRefRepository: deps.questionSourceRefRepository,
      topicRepository: deps.topicRepository,
      embeddingAdapter: deps.embeddingAdapter,
      llmAdapter: deps.llmAdapter,
      logger,
    }));
  } else {
    queue.registerHandler('GENERATE_QUESTIONS', makeStubHandler('GENERATE_QUESTIONS', logger));
  }
  if (deps.gradingService) {
    queue.registerHandler('GRADE_INTERVIEW', makeGradeInterviewHandler(deps.gradingService, logger));
  } else {
    queue.registerHandler('GRADE_INTERVIEW', makeStubHandler('GRADE_INTERVIEW', logger));
  }

  if (deps.emailService) {
    queue.registerHandler('SEND_EMAIL', makeSendEmailHandler(deps.emailService, logger));
  } else {
    queue.registerHandler('SEND_EMAIL', makeStubHandler('SEND_EMAIL', logger));
  }
  return queue;
}

module.exports = {
  registerDefaultHandlers,
  makeStubHandler,
  makeSendEmailHandler,
  makeIngestMaterialHandler,
  makeGenerateQuestionsHandler,
  makeGradeInterviewHandler,
  MIN_EXTRACTED_CHARS,
};
