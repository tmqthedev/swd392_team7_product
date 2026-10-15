const test = require('node:test');
const assert = require('node:assert/strict');
const { makeIngestMaterialHandler } = require('../src/jobs/handlers');

const silentLogger = {
  info() {}, warn() {}, error() {}, debug() {},
};

// A withTransaction that just runs the callback with a tx client proxying to
// the same fakes (the repos ignore the client arg in these tests).
function fakeDb() {
  return {
    async withTransaction(fn) {
      return fn({ query: async () => ({ rows: [] }) });
    },
  };
}

function makeDeps(overrides = {}) {
  const calls = {
    statuses: [],
    inserted: null,
    setPageCount: null,
    deleted: false,
  };

  const material = overrides.material || {
    course_material_id: 7,
    subject_id: 42,
    mime_type: 'application/pdf',
    file_key: 'materials/42/abc/file.pdf',
    status: 'UPLOADED',
  };

  const courseMaterialRepository = {
    async findById() { return material; },
    async updateStatus(id, status, error) { calls.statuses.push({ id, status, error }); return material; },
    async setPageCount(id, pageCount) { calls.setPageCount = { id, pageCount }; return material; },
  };
  const materialChunkRepository = {
    async deleteByMaterial() { calls.deleted = true; return 0; },
    async insertMany(materialId, subjectId, chunks) {
      calls.inserted = { materialId, subjectId, chunks };
      return chunks;
    },
  };
  const embeddingAdapter = { async embed() { return [0.1, 0.2, 0.3]; } };
  const awsClients = {
    async getObject() { return Buffer.from('pdf-bytes'); },
    ...overrides.awsClients,
  };
  const parse = overrides.parse || (async () => ({
    segments: [{ page: 1, text: 'This is a document with a real text layer, plenty of words here.' }],
    pageCount: 3,
  }));

  const handler = makeIngestMaterialHandler({
    db: overrides.db || fakeDb(),
    courseMaterialRepository,
    materialChunkRepository,
    embeddingAdapter,
    awsClients,
    parse,
    env: { materialsBucket: 'test-bucket' },
    logger: silentLogger,
  });

  return {
    handler, calls, material,
  };
}

test('happy path: PROCESSING then READY, persists pageCount and threads subject_id', async () => {
  const { handler, calls } = makeDeps();
  await handler({ background_job_id: 1, payload: { materialId: 7 } });

  const statuses = calls.statuses.map((s) => s.status);
  assert.ok(statuses.includes('PROCESSING'));
  assert.equal(statuses[statuses.length - 1], 'READY');

  assert.ok(calls.deleted, 'existing chunks deleted first');
  assert.equal(calls.inserted.materialId, 7);
  assert.equal(calls.inserted.subjectId, 42); // material.subject_id threaded in
  assert.ok(calls.inserted.chunks.length >= 1);
  assert.ok(calls.inserted.chunks[0].embedding, 'chunks carry an embedding');
  assert.deepEqual(calls.setPageCount, { id: 7, pageCount: 3 }); // parser pageCount
});

test('no text layer: marks FAILED without throwing and never inserts chunks', async () => {
  const { handler, calls } = makeDeps({
    parse: async () => ({ segments: [{ page: 1, text: 'tiny' }], pageCount: 1 }),
  });
  await handler({ background_job_id: 2, payload: { materialId: 7 } });

  const statuses = calls.statuses.map((s) => s.status);
  assert.equal(statuses[statuses.length - 1], 'FAILED');
  assert.equal(calls.inserted, null);
  assert.equal(calls.setPageCount, null);
});

test('parse error: marks FAILED without throwing', async () => {
  const { handler, calls } = makeDeps({
    parse: async () => { throw new Error('corrupt file'); },
  });
  await handler({ background_job_id: 3, payload: { materialId: 7 } });

  const statuses = calls.statuses.map((s) => s.status);
  assert.equal(statuses[statuses.length - 1], 'FAILED');
  assert.equal(calls.inserted, null);
});

test('S3 getObject error rethrows so the queue retries', async () => {
  const { handler } = makeDeps({
    awsClients: { async getObject() { throw new Error('S3 down'); } },
  });
  await assert.rejects(
    () => handler({ background_job_id: 4, payload: { materialId: 7 } }),
    /S3 down/,
  );
});

test('embedding error rethrows so the queue retries', async () => {
  const deps = makeDeps();
  // Rebuild with a throwing embedder.
  const throwing = makeIngestMaterialHandlerWithThrowingEmbedder();
  await assert.rejects(
    () => throwing.handler({ background_job_id: 5, payload: { materialId: 7 } }),
    /embed boom/,
  );
  assert.ok(deps); // keep lint happy
});

test('already READY material is a no-op (no re-ingest)', async () => {
  const { handler, calls } = makeDeps({
    material: {
      course_material_id: 7, subject_id: 42, mime_type: 'application/pdf', file_key: 'k', status: 'READY',
    },
  });
  await handler({ background_job_id: 6, payload: { materialId: 7 } });
  assert.equal(calls.statuses.length, 0);
  assert.equal(calls.inserted, null);
});

function makeIngestMaterialHandlerWithThrowingEmbedder() {
  const material = {
    course_material_id: 7, subject_id: 42, mime_type: 'application/pdf', file_key: 'k', status: 'UPLOADED',
  };
  const handler = makeIngestMaterialHandler({
    db: fakeDb(),
    courseMaterialRepository: {
      async findById() { return material; },
      async updateStatus() { return material; },
      async setPageCount() { return material; },
    },
    materialChunkRepository: {
      async deleteByMaterial() { return 0; },
      async insertMany() { return []; },
    },
    embeddingAdapter: { async embed() { throw new Error('embed boom'); } },
    awsClients: { async getObject() { return Buffer.from('bytes'); } },
    parse: async () => ({
      segments: [{ page: 1, text: 'A long enough text layer to pass the minimum chars gate.' }],
      pageCount: 1,
    }),
    env: { materialsBucket: 'test-bucket' },
    logger: silentLogger,
  });
  return { handler };
}
