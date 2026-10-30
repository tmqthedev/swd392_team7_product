const test = require('node:test');
const assert = require('node:assert/strict');
const { QuestionGenerationService } = require('../src/services/questionGenerationService');
const { makeGenerateQuestionsHandler } = require('../src/jobs/handlers');
const { MockLlmAdapter } = require('../src/llm/mockLlmAdapter');
const { createMockEmbeddingAdapter } = require('../src/embedding/mockEmbeddingAdapter');

const silentLogger = {
  info() {}, warn() {}, error() {}, debug() {},
};

const lecturer = { id: 5, role: 'LECTURER' };
const admin = { id: 1, role: 'ADMIN' };

// --- Fakes --------------------------------------------------------------

function makeRequestDeps(overrides = {}) {
  const spies = { enqueued: [], createdJobs: [] };

  const topicRepository = {
    async getById(id) {
      if (overrides.topic === 'missing') return null;
      return overrides.topic || { topic_id: id, name: 'Photosynthesis', subject_id: 42 };
    },
  };
  const subjectRepository = {
    async listSubjectIdsForLecturer() { return overrides.lecturerSubjects ?? [42]; },
  };
  const courseMaterialRepository = {
    async findById(id) {
      if (overrides.materials && overrides.materials[id]) return overrides.materials[id];
      return { course_material_id: id, subject_id: 42, status: 'READY' };
    },
  };
  const questionGenerationJobRepository = {
    async create(payload) {
      const row = { question_generation_job_id: 100, ...payload };
      spies.createdJobs.push(payload);
      return row;
    },
  };
  const enqueueJob = async (type, payload) => { spies.enqueued.push({ type, payload }); };

  const service = new QuestionGenerationService({
    questionGenerationJobRepository,
    questionRepository: {},
    questionSourceRefRepository: {},
    courseMaterialRepository,
    topicRepository,
    subjectRepository,
    rubricRepository: {
      async findById(id) { return (overrides.rubrics || { 3: { rubric_id: 3, subject_id: 42 }, 4: { rubric_id: 4, subject_id: 99 } })[id] || null; },
    },
    embeddingAdapter: createMockEmbeddingAdapter(),
    enqueueJob,
    logger: silentLogger,
  });

  return { service, spies };
}

// --- Request path -------------------------------------------------------

test('createJob persists requestedBy and enqueues GENERATE_QUESTIONS', async () => {
  const { service, spies } = makeRequestDeps();
  const job = await service.createJob({
    user: lecturer,
    topicId: 7,
    materialIds: [1, 2],
    requestedCount: 3,
    language: 'en',
  });

  assert.equal(job.question_generation_job_id, 100);
  assert.equal(spies.createdJobs[0].requestedBy, 5);
  assert.equal(spies.createdJobs[0].status, 'PENDING');
  assert.equal(spies.enqueued.length, 1);
  assert.equal(spies.enqueued[0].type, 'GENERATE_QUESTIONS');
  assert.deepEqual(spies.enqueued[0].payload, { jobId: 100 });
});

test('createJob rejects requestedCount out of range (400)', async () => {
  const { service } = makeRequestDeps();
  await assert.rejects(
    () => service.createJob({
      user: lecturer, topicId: 7, materialIds: [1], requestedCount: 99, language: 'en',
    }),
    (e) => { assert.equal(e.statusCode, 400); return true; },
  );
});

test('createJob rejects a non-READY / wrong-subject material (MATERIALS_NOT_READY)', async () => {
  const { service } = makeRequestDeps({
    materials: {
      1: { course_material_id: 1, subject_id: 42, status: 'READY' },
      2: { course_material_id: 2, subject_id: 42, status: 'PROCESSING' },
    },
  });
  await assert.rejects(
    () => service.createJob({
      user: lecturer, topicId: 7, materialIds: [1, 2], requestedCount: 2, language: 'en',
    }),
    (e) => {
      assert.equal(e.statusCode, 400);
      assert.equal(e.code, 'MATERIALS_NOT_READY');
      assert.deepEqual(e.materialIds, [2]);
      return true;
    },
  );
});

test('createJob rejects a bloomDistribution that does not sum to requestedCount', async () => {
  const { service } = makeRequestDeps();
  await assert.rejects(
    () => service.createJob({
      user: lecturer,
      topicId: 7,
      materialIds: [1],
      requestedCount: 3,
      bloomDistribution: { REMEMBER: 1, APPLY: 1 },
      language: 'en',
    }),
    (e) => { assert.equal(e.code, 'BLOOM_SUM_MISMATCH'); return true; },
  );
});

test('createJob returns 404 for an unknown topic', async () => {
  const { service } = makeRequestDeps({ topic: 'missing' });
  await assert.rejects(
    () => service.createJob({
      user: lecturer, topicId: 7, materialIds: [1], requestedCount: 1, language: 'en',
    }),
    (e) => { assert.equal(e.statusCode, 404); assert.equal(e.code, 'TOPIC_NOT_FOUND'); return true; },
  );
});

test('createJob returns 403 for an out-of-scope lecturer (ADMIN bypasses)', async () => {
  const denied = makeRequestDeps({ lecturerSubjects: [99] });
  await assert.rejects(
    () => denied.service.createJob({
      user: lecturer, topicId: 7, materialIds: [1], requestedCount: 1, language: 'en',
    }),
    (e) => { assert.equal(e.statusCode, 403); return true; },
  );

  const allowed = makeRequestDeps({ lecturerSubjects: [] });
  const job = await allowed.service.createJob({
    user: admin, topicId: 7, materialIds: [1], requestedCount: 1, language: 'en',
  });
  assert.ok(job);
});

// --- Handler path (fakes + mock LLM + mock embedder) --------------------

function makeHandlerDeps(overrides = {}) {
  const state = {
    questions: [],
    sourceRefs: [],
    statuses: [],
    generatedCount: null,
    setGeneratedCountCalls: 0,
    createClients: [],
    refClients: [],
    deletedForJobs: [],
    txCount: 0,
  };

  let nextQuestionId = 1;

  const domainJob = overrides.domainJob || {
    question_generation_job_id: 100,
    topic_id: 7,
    material_ids: [1, 2],
    bloom_distribution: null,
    language: 'en',
    requested_count: 3,
    requested_by: 5,
    status: 'PENDING',
  };

  const questionGenerationJobRepository = {
    async findById() { return domainJob; },
    async updateStatus(id, status, error) { state.statuses.push({ status, error }); return domainJob; },
    async setGeneratedCount(id, n) {
      state.generatedCount = n;
      state.setGeneratedCountCalls += 1;
      return domainJob;
    },
  };

  const topicRepository = {
    async getById() { return { topic_id: 7, name: 'Photosynthesis', subject_id: 42 }; },
  };

  const chunkRows = overrides.chunkRows || [
    { material_chunk_id: 11, material_id: 1, location: 'page 1', content: 'Photosynthesis converts light energy into chemical energy stored in glucose molecules for the cell.' },
    { material_chunk_id: 22, material_id: 2, location: 'page 2', content: 'The Calvin cycle fixes carbon dioxide into organic compounds within the chloroplast stroma over time.' },
  ];
  const materialChunkRepository = {
    async findNearestForTopic() { return chunkRows; },
  };

  const questionRepository = {
    async findByNormalizedContent(normalized) {
      if (overrides.exactDupFor && overrides.exactDupFor === normalized) {
        return { question_id: 999 };
      }
      return null;
    },
    async findSubjectEmbeddingsByTopic() { return overrides.subjectEmbeddings || []; },
    async create(payload, client) {
      const row = { question_id: nextQuestionId++, ...payload };
      state.questions.push(payload);
      state.createClients.push(client);
      return row;
    },
    async deleteUnreviewedByGenerationJob(jobId) {
      state.deletedForJobs.push(jobId);
      state.questions = state.questions.filter((q) => q.generationJobId !== jobId);
    },
  };
  const questionSourceRefRepository = {
    async create(ref, client) {
      state.sourceRefs.push(ref);
      state.refClients.push(client);
      return { question_source_ref_id: state.sourceRefs.length, ...ref };
    },
  };

  const handler = makeGenerateQuestionsHandler({
    db: { withTransaction: async (fn) => { const tx = { tx: ++state.txCount }; return fn(tx); } },
    questionGenerationJobRepository,
    courseMaterialRepository: {},
    materialChunkRepository,
    questionRepository,
    questionSourceRefRepository,
    topicRepository,
    embeddingAdapter: overrides.embeddingAdapter || createMockEmbeddingAdapter(),
    llmAdapter: overrides.llmAdapter || new MockLlmAdapter(),
    logger: silentLogger,
  });

  return { handler, state, domainJob };
}

test('handler persists requested survivors as PENDING_REVIEW/AI with citations and generation_job_id', async () => {
  const { handler, state } = makeHandlerDeps();
  await handler({ payload: { jobId: 100 } });

  assert.equal(state.questions.length, 3);
  for (const q of state.questions) {
    assert.equal(q.status, 'PENDING_REVIEW');
    assert.equal(q.source, 'AI');
    assert.equal(q.generationJobId, 100);
    assert.equal(q.createdBy, 5);
  }
  assert.ok(state.sourceRefs.length >= 3, 'each survivor has >= 1 source ref');
  assert.equal(state.generatedCount, 3);
  assert.equal(state.statuses[state.statuses.length - 1].status, 'COMPLETED');
});

test('a draft citing a chunk not in R is dropped', async () => {
  // LLM that cites chunk 999 which is never retrieved.
  const llmAdapter = {
    async generateQuestions() {
      return [{
        content: 'Q citing a stranger chunk',
        bloom_level: 'REMEMBER',
        reference_answer: 'ans',
        key_points: ['a', 'b', 'c'],
        citations: [{ chunk_id: 999, excerpt: 'nope' }],
        purpose: 'p',
        synthesis: 's',
      }];
    },
  };
  const { handler, state } = makeHandlerDeps({ llmAdapter });
  await handler({ payload: { jobId: 100 } });
  assert.equal(state.questions.length, 0);
  assert.equal(state.generatedCount, 0);
  assert.equal(state.statuses[state.statuses.length - 1].error, 'No groundable questions could be generated from these materials.');
});

test('a citation whose excerpt is not a substring is removed; draft dropped when none remain', async () => {
  const llmAdapter = {
    async generateQuestions() {
      return [{
        content: 'Q with a bad excerpt',
        bloom_level: 'UNDERSTAND',
        reference_answer: 'ans',
        key_points: ['a', 'b', 'c'],
        citations: [{ chunk_id: 11, excerpt: 'this text is not present in chunk eleven at all' }],
        purpose: 'p',
        synthesis: 's',
      }];
    },
  };
  const { handler, state } = makeHandlerDeps({ llmAdapter });
  await handler({ payload: { jobId: 100 } });
  assert.equal(state.questions.length, 0);
});

test('a draft with no citations is dropped', async () => {
  const llmAdapter = {
    async generateQuestions() {
      return [{
        content: 'Q with no citations',
        bloom_level: 'APPLY',
        reference_answer: 'ans',
        key_points: ['a', 'b', 'c'],
        citations: [],
        purpose: 'p',
        synthesis: 's',
      }];
    },
  };
  const { handler, state } = makeHandlerDeps({ llmAdapter });
  await handler({ payload: { jobId: 100 } });
  assert.equal(state.questions.length, 0);
});

test('near-duplicate is recorded as a non-blocking warning in rationale', async () => {
  // Make the subject corpus contain an embedding identical to a draft's, so
  // cosine similarity hits 1.0 (>= threshold) without blocking persistence.
  const embedder = createMockEmbeddingAdapter();
  // Build a single-draft LLM so we can precompute the content/embedding.
  const content = 'Grounded near-duplicate question';
  const dupEmbedding = await embedder.embed(content);
  const llmAdapter = {
    async generateQuestions() {
      return [{
        content,
        bloom_level: 'REMEMBER',
        reference_answer: 'ans',
        key_points: ['a', 'b', 'c'],
        citations: [{ chunk_id: 11, excerpt: 'Photosynthesis converts light energy' }],
        purpose: 'p',
        synthesis: 's',
      }];
    },
  };
  const { handler, state } = makeHandlerDeps({
    llmAdapter,
    embeddingAdapter: embedder,
    subjectEmbeddings: [{ question_id: 500, embedding: dupEmbedding }],
  });
  await handler({ payload: { jobId: 100 } });

  assert.equal(state.questions.length, 1); // non-blocking: still persisted
  const rationale = state.questions[0].rationale;
  assert.ok(rationale.warnings && Array.isArray(rationale.warnings.nearDuplicateOf));
  assert.equal(rationale.warnings.nearDuplicateOf[0].questionId, 500);
});

test('exact-duplicate draft is dropped without routing through questionService.createQuestion', async () => {
  const content = 'Exactly duplicated question';
  const llmAdapter = {
    async generateQuestions() {
      return [{
        content,
        bloom_level: 'REMEMBER',
        reference_answer: 'ans',
        key_points: ['a', 'b', 'c'],
        citations: [{ chunk_id: 11, excerpt: 'Photosynthesis converts light energy' }],
        purpose: 'p',
        synthesis: 's',
      }];
    },
  };
  const { handler, state } = makeHandlerDeps({
    llmAdapter,
    exactDupFor: content.trim().toLowerCase(),
  });
  await handler({ payload: { jobId: 100 } });
  assert.equal(state.questions.length, 0);
});

test('setGeneratedCount is absolute: a simulated retry does not double-count', async () => {
  const { handler, state } = makeHandlerDeps();
  await handler({ payload: { jobId: 100 } });
  const afterFirst = state.generatedCount;
  await handler({ payload: { jobId: 100 } }); // retry
  assert.equal(state.generatedCount, afterFirst); // absolute, not summed
  assert.equal(afterFirst, 3);
});

test('on error the domain job is marked FAILED and the error rethrows', async () => {
  const llmAdapter = {
    async generateQuestions() { throw new Error('LLM boom'); },
  };
  const { handler, state } = makeHandlerDeps({ llmAdapter });
  await assert.rejects(() => handler({ payload: { jobId: 100 } }), /LLM boom/);
  assert.equal(state.statuses[state.statuses.length - 1].status, 'FAILED');
});

test('a retried run clears the previous attempt unreviewed questions instead of duplicating them', async () => {
  const { handler, state } = makeHandlerDeps();
  await handler({ payload: { jobId: 100 } });
  await handler({ payload: { jobId: 100 } }); // retry / recovered run
  assert.deepEqual(state.deletedForJobs, [100, 100]);
  assert.equal(state.questions.length, 3, 'second run replaced, not appended to, the first');
});

test('each question and its citations are written through one shared transaction client', async () => {
  const { handler, state } = makeHandlerDeps();
  await handler({ payload: { jobId: 100 } });
  assert.equal(state.txCount, 3, 'one transaction per persisted question');
  assert.ok(state.createClients.every((client) => client && client.tx));
  // every citation of a question reuses the question insert's tx client
  for (const client of state.refClients) {
    assert.ok(state.createClients.includes(client));
  }
});

test('while queue retries remain the domain job stays RUNNING; it is FAILED only when exhausted', async () => {
  const llmAdapter = { async generateQuestions() { throw new Error('transient'); } };

  const retrying = makeHandlerDeps({ llmAdapter });
  await assert.rejects(
    () => retrying.handler({ payload: { jobId: 100 }, attempts: 1, max_attempts: 3 }),
    /transient/,
  );
  const last = retrying.state.statuses[retrying.state.statuses.length - 1];
  assert.equal(last.status, 'RUNNING');
  assert.equal(last.error, 'transient');

  const exhausted = makeHandlerDeps({ llmAdapter });
  await assert.rejects(
    () => exhausted.handler({ payload: { jobId: 100 }, attempts: 3, max_attempts: 3 }),
    /transient/,
  );
  assert.equal(exhausted.state.statuses[exhausted.state.statuses.length - 1].status, 'FAILED');
});

test('when job.max_attempts is null (default in db) and attempts is 1, domain job stays RUNNING and rethrows', async () => {
  const llmAdapter = { async generateQuestions() { throw new Error('ThrottlingException'); } };
  const retrying = makeHandlerDeps({ llmAdapter });
  await assert.rejects(
    () => retrying.handler({ payload: { jobId: 100 }, attempts: 1 }),
    /ThrottlingException/,
  );
  const last = retrying.state.statuses[retrying.state.statuses.length - 1];
  assert.equal(last.status, 'RUNNING');
  assert.equal(last.error, 'ThrottlingException');
});

test('createJob stores an optional rubric of the same subject; rejects a mismatched or unknown one', async () => {
  const { service, spies } = makeRequestDeps();
  await service.createJob({ user: lecturer, topicId: 7, materialIds: [1], requestedCount: 1, language: 'en', rubricId: 3 });
  assert.equal(spies.createdJobs[0].rubricId, 3);
  await service.createJob({ user: lecturer, topicId: 7, materialIds: [1], requestedCount: 1, language: 'en' });
  assert.equal(spies.createdJobs[1].rubricId, null);
  await assert.rejects(
    () => service.createJob({ user: lecturer, topicId: 7, materialIds: [1], requestedCount: 1, language: 'en', rubricId: 4 }),
    (err) => err.statusCode === 400 && err.code === 'RUBRIC_SUBJECT_MISMATCH',
  );
  await assert.rejects(
    () => service.createJob({ user: lecturer, topicId: 7, materialIds: [1], requestedCount: 1, language: 'en', rubricId: 77 }),
    (err) => err.code === 'VALIDATION_ERROR',
  );
});
