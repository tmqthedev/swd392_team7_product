/**
 * Materials upload API E2E (Jest + Supertest), mock-DB style.
 *
 * Like the other *.e2e.test.js suites this runs fully offline: the AWS clients
 * are the in-process mock (S3 put/get round-trips in memory) and the data
 * access is backed by in-memory fakes injected through createApp overrides,
 * because the legacy InMemoryDatabase does not model course_material /
 * background_job SQL. It exercises the real router + controller + service wiring
 * (requireAuth/requireRole + multer + MaterialService) end to end: a LECTURER
 * uploads a PDF, gets 201, and an INGEST_MATERIAL background job is enqueued.
 */
const request = require('supertest');
const pino = require('pino');
const { createApp } = require('../src/app');

const SUBJECT_ID = 7;
const LECTURER_ID = 1;

// In-memory course_material fake mirroring the method surface MaterialService
// uses. No SQL; just a Map keyed by course_material_id.
class FakeCourseMaterialRepo {
  constructor() {
    this.rows = new Map();
    this.nextId = 1;
  }

  async create(payload) {
    const id = this.nextId++;
    const row = {
      course_material_id: id,
      subject_id: payload.subjectId ?? null,
      topic_id: payload.topicId ?? null,
      title: payload.title ?? null,
      file_key: payload.fileKey ?? null,
      mime_type: payload.mimeType ?? null,
      size_bytes: payload.sizeBytes ?? null,
      page_count: payload.pageCount ?? null,
      status: payload.status ?? 'UPLOADED',
      error: null,
      uploaded_by: payload.uploadedBy ?? null,
    };
    this.rows.set(id, row);
    return row;
  }

  async findById(id) {
    return this.rows.get(Number(id)) || null;
  }

  async listBySubject(subjectId) {
    return [...this.rows.values()].filter((r) => Number(r.subject_id) === Number(subjectId));
  }
}

// Subject repo fake: the single LECTURER owns SUBJECT_ID.
class FakeSubjectRepo {
  async listSubjectIdsForLecturer(lecturerId) {
    return Number(lecturerId) === LECTURER_ID ? [SUBJECT_ID] : [];
  }
}

// Captures enqueued jobs so the test can assert INGEST_MATERIAL was pushed.
class FakeEnqueue {
  constructor() {
    this.jobs = [];
  }

  handler() {
    return async (type, payload) => {
      const row = {
        background_job_id: this.jobs.length + 1,
        type,
        payload,
        status: 'PENDING',
      };
      this.jobs.push(row);
      return row;
    };
  }
}

const testEnv = {
  awsMockMode: true,
  dbMockMode: true,
  materialsBucket: 'test-materials-bucket',
};

function buildApp() {
  const courseMaterialRepository = new FakeCourseMaterialRepo();
  const subjectRepository = new FakeSubjectRepo();
  const enqueue = new FakeEnqueue();

  const app = createApp({
    env: testEnv,
    logger: pino({ level: 'silent' }),
    courseMaterialRepository,
    subjectRepository,
    enqueueJob: enqueue.handler(),
  });

  const cookie = `${require('../src/auth/cookieNames').ACCESS_COOKIE}=`
    + `${app.authContext.tokenService.signAccess({ sub: LECTURER_ID, role: 'LECTURER' }).token}`;

  return {
    app, courseMaterialRepository, enqueue, cookie,
  };
}

const PDF_BYTES = Buffer.from('%PDF-1.4 minimal test payload', 'utf8');

describe('materials upload API (mock-DB e2e)', () => {
  test('LECTURER upload -> 201 and enqueues INGEST_MATERIAL', async () => {
    const {
      app, courseMaterialRepository, enqueue, cookie,
    } = buildApp();

    const res = await request(app)
      .post('/api/materials')
      .set('Cookie', cookie)
      .field('subjectId', String(SUBJECT_ID))
      .field('title', 'Intro to Concurrency')
      .attach('file', PDF_BYTES, { filename: 'concurrency.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('UPLOADED');
    expect(Number(res.body.subject_id)).toBe(SUBJECT_ID);

    // The row was persisted and a background job was enqueued for ingestion.
    const materialId = res.body.course_material_id;
    expect(await courseMaterialRepository.findById(materialId)).not.toBeNull();
    expect(enqueue.jobs).toHaveLength(1);
    expect(enqueue.jobs[0].type).toBe('INGEST_MATERIAL');
    expect(enqueue.jobs[0].payload).toEqual({ materialId });
  });

  test('upload without a LECTURER session -> 401', async () => {
    const { app } = buildApp();
    const res = await request(app)
      .post('/api/materials')
      .field('subjectId', String(SUBJECT_ID))
      .attach('file', PDF_BYTES, { filename: 'c.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(401);
  });

  test('upload with a missing subjectId -> 400 before any write', async () => {
    const { app, courseMaterialRepository, cookie } = buildApp();
    const res = await request(app)
      .post('/api/materials')
      .set('Cookie', cookie)
      .attach('file', PDF_BYTES, { filename: 'c.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(courseMaterialRepository.rows.size).toBe(0);
  });
});
