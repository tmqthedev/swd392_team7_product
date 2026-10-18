const test = require('node:test');
const assert = require('node:assert/strict');
const { createMockEmbeddingAdapter, EMBEDDING_DIMS } = require('../src/embedding/mockEmbeddingAdapter');
const { createEmbeddingAdapter } = require('../src/embedding/embeddingAdapter');
const { cosineSimilarity } = require('../src/embedding/cosineSimilarity');
const { QuestionService } = require('../src/services/questionService');

function magnitude(vec) {
  return Math.sqrt(vec.reduce((sum, x) => sum + x * x, 0));
}

test('mock embed returns a deterministic, 1024-length, L2-normalized vector', async () => {
  const adapter = createMockEmbeddingAdapter();
  const a1 = await adapter.embed('Explain the Node.js event loop.');
  const a2 = await adapter.embed('Explain the Node.js event loop.');

  assert.equal(a1.length, EMBEDDING_DIMS);
  assert.deepEqual(a1, a2); // deterministic
  assert.ok(Math.abs(magnitude(a1) - 1) < 1e-9); // L2-normalized
});

test('normalized-equivalent text produces the same vector; different text differs', async () => {
  const adapter = createMockEmbeddingAdapter();
  const same = await adapter.embed('  EXPLAIN   the Event Loop  ');
  const sameNormalized = await adapter.embed('explain the event loop');
  const different = await adapter.embed('Describe garbage collection.');

  assert.deepEqual(same, sameNormalized);
  assert.notDeepEqual(same, different);
});

test('createEmbeddingAdapter returns the mock for mock/unset provider', async () => {
  const fromMock = createEmbeddingAdapter({ embeddingProvider: 'mock' });
  const fromUnset = createEmbeddingAdapter({});
  const v = await fromMock.embed('hello');
  assert.equal(v.length, EMBEDDING_DIMS);
  assert.equal((await fromUnset.embed('hello')).length, EMBEDDING_DIMS);
});

test('cosine of identical normalized text is >= 0.9 and dissimilar < 1', async () => {
  const adapter = createMockEmbeddingAdapter();
  const a = await adapter.embed('What is a closure?');
  const b = await adapter.embed('what is a closure?');
  const c = await adapter.embed('Explain tail-call optimization.');

  assert.ok(cosineSimilarity(a, b) >= 0.9);
  assert.ok(cosineSimilarity(a, c) < 0.9);
});

// --- Service-level near-duplicate behavior -----------------------------------

class FakeRepo {
  constructor(existing = []) {
    this.rows = new Map();
    this.nextId = 1;
    this.sameSubject = existing; // [{ question_id, embedding }]
  }

  async findAllFiltered() { return [...this.rows.values()]; }

  async findById(id) { const r = this.rows.get(Number(id)); return r ? { ...r } : null; }

  async findByNormalizedContent(normalized) {
    for (const row of this.rows.values()) {
      if (String(row.content).trim().toLowerCase() === normalized) return { question_id: row.question_id };
    }
    return null;
  }

  async create(payload) {
    const id = this.nextId++;
    const row = {
      question_id: id,
      topic_id: payload.topicId,
      rubric_id: payload.rubricId ?? null,
      content: payload.content,
      status: payload.status,
      language: payload.language ?? null,
      source: payload.source ?? null,
      rationale: payload.rationale ?? null,
      embedding: payload.embedding ?? null,
    };
    this.rows.set(id, row);
    return { ...row };
  }

  async findSubjectEmbeddingsByTopic() { return this.sameSubject; }
}

test('createQuestion attaches a NON-blocking NEAR_DUPLICATE warning when cosine >= 0.9 and still saves', async () => {
  const adapter = createMockEmbeddingAdapter();
  const existingVec = await adapter.embed('What is a closure?');
  const repo = new FakeRepo([{ question_id: 42, embedding: existingVec }]);
  const service = new QuestionService({ repository: repo, embeddingAdapter: adapter });

  const { question, warnings } = await service.createQuestion({
    topicId: 1,
    content: 'what is a CLOSURE?', // normalizes to the same text => cosine 1.0
    language: 'en',
  });

  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].type, 'NEAR_DUPLICATE');
  assert.equal(warnings[0].questionId, 42);
  assert.ok(warnings[0].similarity >= 0.9);
  // Still persisted (non-blocking).
  assert.ok(question.id);
  assert.equal(await repo.rows.size, 1);
});

test('createQuestion emits no warning when the closest same-subject question is dissimilar', async () => {
  const adapter = createMockEmbeddingAdapter();
  const existingVec = await adapter.embed('Explain tail-call optimization.');
  const repo = new FakeRepo([{ question_id: 7, embedding: existingVec }]);
  const service = new QuestionService({ repository: repo, embeddingAdapter: adapter });

  const { warnings } = await service.createQuestion({
    topicId: 1,
    content: 'What is a closure?',
    language: 'en',
  });
  assert.deepEqual(warnings, []);
});

test('exact-duplicate content is still a hard 409 before any embedding scan', async () => {
  const adapter = createMockEmbeddingAdapter();
  const repo = new FakeRepo();
  const service = new QuestionService({ repository: repo, embeddingAdapter: adapter });

  await service.createQuestion({ topicId: 1, content: 'Unique question', language: 'en' });
  await assert.rejects(
    () => service.createQuestion({ topicId: 1, content: '  unique QUESTION ', language: 'en' }),
    (error) => {
      assert.equal(error.statusCode, 409);
      assert.equal(error.code, 'DUPLICATE_QUESTION');
      return true;
    },
  );
});
