const test = require('node:test');
const assert = require('node:assert/strict');
const { QuestionService } = require('../src/services/questionService');

// Fake question repository backed by a Map. Mirrors the real repository's
// method surface used by the service; no InMemoryDatabase, no SQL.
class FakeQuestionRepo {
  constructor() {
    this.rows = new Map();
    this.nextId = 1;
  }

  _normalized(content) {
    return String(content).trim().toLowerCase();
  }

  async findAllFiltered({ status, bloom, source } = {}) {
    let all = [...this.rows.values()];
    if (status) all = all.filter((r) => r.status === status);
    if (bloom) all = all.filter((r) => r.bloom_level === bloom);
    if (source) all = all.filter((r) => r.source === source);
    return all.sort((a, b) => a.question_id - b.question_id).map((r) => ({ ...r }));
  }

  async findById(id) {
    const row = this.rows.get(Number(id));
    return row ? { ...row } : null;
  }

  async findByNormalizedContent(normalized, excludeId = null) {
    for (const row of this.rows.values()) {
      if (this._normalized(row.content) !== normalized) continue;
      if (excludeId != null && row.question_id === excludeId) continue;
      return { question_id: row.question_id };
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
      bloom_level: payload.bloomLevel ?? null,
      language: payload.language ?? null,
      reference_answer: payload.referenceAnswer ?? null,
      key_points: payload.keyPoints ?? null,
      source: payload.source ?? null,
      rationale: payload.rationale ?? null,
      embedding: payload.embedding ?? null,
      created_by: payload.createdBy ?? null,
      reviewed_by: payload.reviewedBy ?? null,
      reviewed_at: payload.reviewedAt ?? null,
      review_note: payload.reviewNote ?? null,
    };
    this.rows.set(id, row);
    return { ...row };
  }

  async update(id, patch) {
    const row = this.rows.get(Number(id));
    if (!row) return null;
    const map = {
      topicId: 'topic_id',
      rubricId: 'rubric_id',
      content: 'content',
      status: 'status',
      bloomLevel: 'bloom_level',
      language: 'language',
      referenceAnswer: 'reference_answer',
      keyPoints: 'key_points',
      source: 'source',
      rationale: 'rationale',
      embedding: 'embedding',
      reviewedBy: 'reviewed_by',
      reviewedAt: 'reviewed_at',
      reviewNote: 'review_note',
    };
    for (const [key, column] of Object.entries(map)) {
      if (patch[key] !== undefined) row[column] = patch[key];
    }
    return { ...row };
  }

  async updateStatusFields(id, fields) {
    return this.update(id, fields);
  }

  async deleteById(id) {
    const row = this.rows.get(Number(id));
    if (!row) return null;
    this.rows.delete(Number(id));
    return { ...row };
  }

  async findSubjectEmbeddingsByTopic() {
    return [];
  }

  async findSameSubjectEmbeddings() {
    return [];
  }
}

// Embedding adapter stub producing a fixed small vector (never near-duplicate
// here because the fake repo returns no same-subject embeddings).
const stubEmbedding = { async embed() { return [1, 0, 0]; } };

function createService() {
  const repository = new FakeQuestionRepo();
  return {
    repository,
    service: new QuestionService({ repository, embeddingAdapter: stubEmbedding }),
  };
}

test('createQuestion returns { question, warnings } and defaults DRAFT without rubric', async () => {
  const { service } = createService();
  const { question, warnings } = await service.createQuestion({
    topicId: 1,
    content: 'Explain OOP in Java.',
    language: 'en',
    bloomLevel: 'UNDERSTAND',
  });

  assert.equal(question.id, 1);
  assert.equal(question.topicId, 1);
  assert.equal(question.content, 'Explain OOP in Java.');
  assert.equal(question.status, 'DRAFT');
  assert.equal(question.rubricId, null);
  assert.equal(question.source, 'MANUAL');
  assert.deepEqual(warnings, []);
});

test('createQuestion defaults APPROVED when content + topic + rubric present', async () => {
  const { service } = createService();
  const { question } = await service.createQuestion({
    topicId: 1,
    rubricId: 5,
    content: 'Describe polymorphism.',
    language: 'en',
  });
  assert.equal(question.status, 'APPROVED');
  assert.equal(question.rubricId, 5);
});

test('createQuestion stores purpose into rationale.purpose and exposes it', async () => {
  const { service } = createService();
  const { question } = await service.createQuestion({
    topicId: 1,
    content: 'What is a thread?',
    language: 'en',
    purpose: 'Assess concurrency basics',
  });
  assert.equal(question.purpose, 'Assess concurrency basics');
  assert.deepEqual(question.rationale, { purpose: 'Assess concurrency basics' });
});

test('createQuestion rejects duplicate content (case-insensitive) with 409 DUPLICATE_QUESTION', async () => {
  const { service } = createService();
  await service.createQuestion({ topicId: 1, content: 'What is a thread?', language: 'en' });

  await assert.rejects(
    () => service.createQuestion({ topicId: 1, content: '  WHAT IS A THREAD?  ', language: 'en' }),
    (error) => {
      assert.equal(error.statusCode, 409);
      assert.equal(error.code, 'DUPLICATE_QUESTION');
      return true;
    },
  );
});

test('createQuestion validates required fields', async () => {
  const { service } = createService();
  await assert.rejects(
    () => service.createQuestion({ topicId: 1 }),
    (error) => {
      assert.equal(error.statusCode, 400);
      return true;
    },
  );
});

test('createQuestion rejects an invalid bloom level', async () => {
  const { service } = createService();
  await assert.rejects(
    () => service.createQuestion({
      topicId: 1, content: 'q', language: 'en', bloomLevel: 'CREATE',
    }),
    (error) => {
      assert.equal(error.statusCode, 400);
      assert.match(error.message, /bloomLevel/);
      return true;
    },
  );
});

test('getQuestionById returns 404 for a missing question', async () => {
  const { service } = createService();
  await assert.rejects(() => service.getQuestionById(999), (error) => {
    assert.equal(error.statusCode, 404);
    return true;
  });
});

test('listQuestions filters by status', async () => {
  const { service } = createService();
  await service.createQuestion({ topicId: 1, content: 'Draft one', language: 'en' });
  await service.createQuestion({
    topicId: 1, rubricId: 2, content: 'Approved one', language: 'en',
  });

  const approved = await service.listQuestions({ status: 'APPROVED' });
  assert.equal(approved.length, 1);
  assert.equal(approved[0].content, 'Approved one');
});

test('updateQuestion patches fields and keeps its own content non-duplicate', async () => {
  const { service } = createService();
  const { question } = await service.createQuestion({ topicId: 1, content: 'Initial', language: 'en' });

  const updated = await service.updateQuestion(question.id, {
    content: 'Updated question',
    bloomLevel: 'APPLY',
  });
  assert.equal(updated.content, 'Updated question');
  assert.equal(updated.bloomLevel, 'APPLY');

  // Re-saving its own content is not a duplicate conflict.
  const same = await service.updateQuestion(question.id, { content: 'Updated question' });
  assert.equal(same.content, 'Updated question');
});

test('approve requires an attached rubric (RUBRIC_REQUIRED) and transitions to APPROVED', async () => {
  const { service, repository } = createService();
  const { question } = await service.createQuestion({ topicId: 1, content: 'needs rubric', language: 'en' });
  // status DRAFT, no rubric.
  await assert.rejects(
    () => service.approve(question.id, { reviewedBy: 7 }),
    (error) => {
      assert.equal(error.statusCode, 409);
      assert.equal(error.code, 'RUBRIC_REQUIRED');
      return true;
    },
  );

  // Attach a rubric then approve.
  await repository.update(question.id, { rubricId: 3 });
  const approved = await service.approve(question.id, { reviewedBy: 7 });
  assert.equal(approved.status, 'APPROVED');
  assert.equal(approved.reviewedBy, 7);
});

test('reject requires a reason (REASON_REQUIRED) and stores the review note', async () => {
  const { service, repository } = createService();
  const { question } = await service.createQuestion({
    topicId: 1, rubricId: 2, content: 'to review', language: 'en',
  });
  // Move to PENDING_REVIEW so REJECTED is a legal transition.
  await repository.update(question.id, { status: 'PENDING_REVIEW' });

  await assert.rejects(
    () => service.reject(question.id, { reason: '  ' }),
    (error) => {
      assert.equal(error.statusCode, 400);
      assert.equal(error.code, 'REASON_REQUIRED');
      return true;
    },
  );

  const rejected = await service.reject(question.id, { reason: 'Too vague', reviewedBy: 9 });
  assert.equal(rejected.status, 'REJECTED');
  assert.equal(rejected.reviewNote, 'Too vague');
});

test('illegal lifecycle transition throws INVALID_TRANSITION', async () => {
  const { service, repository } = createService();
  const { question } = await service.createQuestion({
    topicId: 1, rubricId: 2, content: 'archived item', language: 'en',
  });
  await repository.update(question.id, { status: 'ARCHIVED' });

  await assert.rejects(
    () => service.approve(question.id, { reviewedBy: 1 }),
    (error) => {
      assert.equal(error.code, 'INVALID_TRANSITION');
      return true;
    },
  );
});

test('deleteQuestion removes the row and then 404s', async () => {
  const { service } = createService();
  const { question } = await service.createQuestion({ topicId: 1, content: 'bye', language: 'en' });
  const deleted = await service.deleteQuestion(question.id);
  assert.equal(deleted.id, question.id);
  await assert.rejects(() => service.getQuestionById(question.id), (error) => {
    assert.equal(error.statusCode, 404);
    return true;
  });
});

test('createQuestion rejects review outcomes as an explicit status', async () => {
  const { service } = createService();
  for (const status of ['APPROVED', 'REJECTED', 'ARCHIVED']) {
    await assert.rejects(
      () => service.createQuestion({ topicId: 1, content: `Q ${status}`, language: 'en', status }),
      (error) => error.statusCode === 400,
    );
  }
});

test('updateQuestion cannot move to APPROVED/REJECTED/ARCHIVED or leave ARCHIVED', async () => {
  const { service, repository } = createService();
  const { question } = await service.createQuestion({ topicId: 1, content: 'Lifecycle guard', language: 'en' });
  await assert.rejects(() => service.updateQuestion(question.id, { status: 'APPROVED' }), (e) => e.statusCode === 400);
  await repository.update(question.id, { status: 'ARCHIVED' });
  await assert.rejects(
    () => service.updateQuestion(question.id, { status: 'DRAFT' }),
    (e) => e.statusCode === 409 && e.code === 'INVALID_TRANSITION',
  );
});

test('updateQuestion keeps the rubric on APPROVED questions', async () => {
  const { service } = createService();
  const { question } = await service.createQuestion({
    topicId: 1, rubricId: 5, content: 'Keep my rubric', language: 'en',
  });
  assert.equal(question.status, 'APPROVED');
  await assert.rejects(
    () => service.updateQuestion(question.id, { rubricId: null }),
    (e) => e.statusCode === 409 && e.code === 'RUBRIC_REQUIRED',
  );
});
