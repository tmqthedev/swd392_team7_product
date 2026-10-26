/**
 * PR-2 API Security Surface E2E Test Suite
 *
 * Verifies the 3 security fixes:
 *   S1: /api/audio/* legacy routes removed -> 404
 *   S2: GET /api/tts/:filename guarded by auth + strict filename validation (no traversal)
 *   S3: /api/topics subject-scoping for lecturers (403 for out-of-scope operations)
 */
const path = require('path');
const request = require('supertest');
const pino = require('pino');
const { Pool } = require('pg');

const { createApp } = require('../src/app');
const { InMemoryDatabase } = require('../src/db/createDatabase');
const { runMigrations } = require('../src/db/migrationRunner');
const { ACCESS_COOKIE } = require('../src/auth/cookieNames');
const { createAwsClients } = require('../src/services/awsClients');

const DB_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
const MIGRATIONS_DIR = path.resolve(__dirname, '..', 'db', 'migrations');
const describeDb = DB_URL ? describe : describe.skip;

function wrapPool(pool) {
  return {
    query: (text, params) => pool.query(text, params),
    async withTransaction(callback) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const tx = { query: (text, params) => client.query(text, params) };
        const result = await callback(tx);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
  };
}

describe('S1 & S2: Audio route removal and TTS endpoint hardening (offline-safe)', () => {
  let app;
  let studentCookie;
  let lecturerCookie;

  beforeAll(async () => {
    const database = new InMemoryDatabase();
    const awsClients = createAwsClients({ awsMockMode: true });
    for (const extension of ['mp3', 'wav']) {
      await awsClients.putObject({ bucket: 'local-audio-bucket', key: `tts-cache/question_audio_123.${extension}`, body: Buffer.from('fixture-audio') });
    }
    app = createApp({
      env: { awsMockMode: true, dbMockMode: true, audioBucket: 'local-audio-bucket' },
      database,
      clients: awsClients,
      logger: pino({ level: 'silent' }),
    });

    const studentToken = app.authContext.tokenService.signAccess({ sub: 10, role: 'STUDENT' }).token;
    studentCookie = `${ACCESS_COOKIE}=${studentToken}`;

    const lecturerToken = app.authContext.tokenService.signAccess({ sub: 20, role: 'LECTURER' }).token;
    lecturerCookie = `${ACCESS_COOKIE}=${lecturerToken}`;
  });

  // --- S1: Legacy /api/audio removed ---
  test('S1: POST /api/audio/upload-url returns 404', async () => {
    const res = await request(app).post('/api/audio/upload-url').send({});
    expect(res.status).toBe(404);
  });

  test('S1: POST /api/audio/process returns 404', async () => {
    const res = await request(app).post('/api/audio/process').send({});
    expect(res.status).toBe(404);
  });

  test('S1: GET /api/audio/status/:id returns 404', async () => {
    const res = await request(app).get('/api/audio/status/dummy-session');
    expect(res.status).toBe(404);
  });

  test('S1: GET /api/audio/result/:id returns 404', async () => {
    const res = await request(app).get('/api/audio/result/dummy-session');
    expect(res.status).toBe(404);
  });

  // --- S2: GET /api/tts/:filename security ---
  test('S2: missing audio reports an error instead of returning synthetic audio', async () => {
    const result = await request(app).get('/api/tts/missing.wav').set('Cookie', studentCookie);
    expect(result.status).toBe(502);
    expect(result.body.code).toBe('TTS_AUDIO_UNAVAILABLE');
  });
  test('S2: GET /api/tts/:filename without auth returns 401', async () => {
    const res = await request(app).get('/api/tts/question_audio.mp3');
    expect(res.status).toBe(401);
  });

  test('S2: GET /api/tts/:filename with valid auth returns 200 and audio/mpeg', async () => {
    const res = await request(app)
      .get('/api/tts/question_audio_123.mp3')
      .set('Cookie', studentCookie);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/audio\/mpeg/);
  });

  test('S2: GET /api/tts/:filename with .wav returns audio/wav', async () => {
    const res = await request(app)
      .get('/api/tts/question_audio_123.wav')
      .set('Cookie', lecturerCookie);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/audio\/wav/);
  });

  test('S2: GET /api/tts/:filename with traversal (..) returns 400 INVALID_FILENAME', async () => {
    const res = await request(app)
      .get('/api/tts/..%2F..%2Fsecret.env')
      .set('Cookie', studentCookie);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_FILENAME');
  });

  test('S2: GET /api/tts/:filename with double dot returns 400 INVALID_FILENAME', async () => {
    const res = await request(app)
      .get('/api/tts/audio..mp3')
      .set('Cookie', studentCookie);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_FILENAME');
  });

  test('S2: GET /api/tts/:filename with illegal characters returns 400 INVALID_FILENAME', async () => {
    const res = await request(app)
      .get('/api/tts/audio$danger.mp3')
      .set('Cookie', studentCookie);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_FILENAME');
  });
});

describeDb('S3: /api/topics lecturer subject-scoping (requires Postgres)', () => {
  let pool;
  let db;
  let app;

  let lecturerAId;
  let lecturerBId;
  let adminId;

  let lecturerACookie;
  let lecturerBCookie;
  let adminCookie;

  let subjectAId;
  let subjectBId;

  let topicAId;
  let topicBId;
  let legacyTopicId;

  beforeAll(async () => {
    pool = new Pool({ connectionString: DB_URL });
    await runMigrations({ pool, dir: MIGRATIONS_DIR, logger: { info() {} } });
    db = wrapPool(pool);

    app = createApp({
      env: { awsMockMode: true, dbMockMode: false },
      database: db,
      logger: pino({ level: 'silent' }),
    });

    const suffix = Date.now();

    // Create Lecturer A and Lecturer B
    const userA = await pool.query(
      `INSERT INTO app_user (email, full_name, role, status)
       VALUES ($1, 'Lecturer A', 'LECTURER', 'ACTIVE') RETURNING app_user_id`,
      [`sec-lecturer-a-${suffix}@aives.local`],
    );
    lecturerAId = userA.rows[0].app_user_id;
    lecturerACookie = `${ACCESS_COOKIE}=${app.authContext.tokenService.signAccess({ sub: lecturerAId, role: 'LECTURER' }).token}`;

    const userB = await pool.query(
      `INSERT INTO app_user (email, full_name, role, status)
       VALUES ($1, 'Lecturer B', 'LECTURER', 'ACTIVE') RETURNING app_user_id`,
      [`sec-lecturer-b-${suffix}@aives.local`],
    );
    lecturerBId = userB.rows[0].app_user_id;
    lecturerBCookie = `${ACCESS_COOKIE}=${app.authContext.tokenService.signAccess({ sub: lecturerBId, role: 'LECTURER' }).token}`;

    const admin = await pool.query(
      `INSERT INTO app_user (email, full_name, role, status)
       VALUES ($1, 'Admin User', 'ADMIN', 'ACTIVE') RETURNING app_user_id`,
      [`sec-admin-${suffix}@aives.local`],
    );
    adminId = admin.rows[0].app_user_id;
    adminCookie = `${ACCESS_COOKIE}=${app.authContext.tokenService.signAccess({ sub: adminId, role: 'ADMIN' }).token}`;

    // Create Subject A and Subject B
    const subA = await pool.query(
      'INSERT INTO subject (code, name) VALUES ($1, $2) RETURNING subject_id',
      [`SUB-A-${suffix}`, 'Subject A'],
    );
    subjectAId = subA.rows[0].subject_id;

    const subB = await pool.query(
      'INSERT INTO subject (code, name) VALUES ($1, $2) RETURNING subject_id',
      [`SUB-B-${suffix}`, 'Subject B'],
    );
    subjectBId = subB.rows[0].subject_id;

    // Assign Lecturer A to Subject A, and Lecturer B to Subject B
    await pool.query('INSERT INTO subject_lecturer (subject_id, lecturer_id) VALUES ($1, $2)', [subjectAId, lecturerAId]);
    await pool.query('INSERT INTO subject_lecturer (subject_id, lecturer_id) VALUES ($1, $2)', [subjectBId, lecturerBId]);

    // Create topics: Topic A in Subject A, Topic B in Subject B, Legacy Topic in NULL
    const topA = await pool.query('INSERT INTO topic (name, subject_id) VALUES ($1, $2) RETURNING topic_id', ['Topic A', subjectAId]);
    topicAId = topA.rows[0].topic_id;

    const topB = await pool.query('INSERT INTO topic (name, subject_id) VALUES ($1, $2) RETURNING topic_id', ['Topic B', subjectBId]);
    topicBId = topB.rows[0].topic_id;

    const topLegacy = await pool.query('INSERT INTO topic (name, subject_id) VALUES ($1, NULL) RETURNING topic_id', ['Legacy Topic']);
    legacyTopicId = topLegacy.rows[0].topic_id;
  });

  afterAll(async () => {
    if (pool) {
      await pool.query('DELETE FROM topic WHERE topic_id IN ($1, $2, $3)', [topicAId, topicBId, legacyTopicId]);
      await pool.query('DELETE FROM subject_lecturer WHERE subject_id IN ($1, $2)', [subjectAId, subjectBId]);
      await pool.query('DELETE FROM subject WHERE subject_id IN ($1, $2)', [subjectAId, subjectBId]);
      await pool.query('DELETE FROM app_user WHERE app_user_id IN ($1, $2, $3)', [lecturerAId, lecturerBId, adminId]);
      await pool.end();
    }
  });

  test('S3: Lecturer A can create topic in assigned Subject A -> 201', async () => {
    const res = await request(app)
      .post('/api/topics')
      .set('Cookie', lecturerACookie)
      .send({ name: 'Lecturer A New Topic', subject_id: subjectAId });
    expect(res.status).toBe(201);
    expect(res.body.subject_id).toBe(subjectAId);

    // Clean up created topic
    await pool.query('DELETE FROM topic WHERE topic_id = $1', [res.body.topic_id]);
  });

  test('S3: Lecturer A CANNOT create topic in unassigned Subject B -> 403 FORBIDDEN', async () => {
    const res = await request(app)
      .post('/api/topics')
      .set('Cookie', lecturerACookie)
      .send({ name: 'Lecturer A Rogue Topic', subject_id: subjectBId });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  test('S3: Lecturer A can read Topic A (in-scope) and Legacy Topic -> 200', async () => {
    const resA = await request(app)
      .get(`/api/topics/${topicAId}`)
      .set('Cookie', lecturerACookie);
    expect(resA.status).toBe(200);
    expect(resA.body.name).toBe('Topic A');

    const resLegacy = await request(app)
      .get(`/api/topics/${legacyTopicId}`)
      .set('Cookie', lecturerACookie);
    expect(resLegacy.status).toBe(200);
    expect(resLegacy.body.name).toBe('Legacy Topic');
  });

  test('S3: Lecturer A CANNOT read Topic B (out-of-scope) -> 403 FORBIDDEN', async () => {
    const res = await request(app)
      .get(`/api/topics/${topicBId}`)
      .set('Cookie', lecturerACookie);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  test('S3: Lecturer A GET /api/topics only returns in-scope and legacy topics', async () => {
    const res = await request(app)
      .get('/api/topics')
      .set('Cookie', lecturerACookie);
    expect(res.status).toBe(200);
    const ids = res.body.map((t) => t.topic_id);
    expect(ids).toContain(topicAId);
    expect(ids).toContain(legacyTopicId);
    expect(ids).not.toContain(topicBId);
  });

  test('S3: Lecturer A CANNOT update Topic B -> 403 FORBIDDEN', async () => {
    const res = await request(app)
      .patch(`/api/topics/${topicBId}`)
      .set('Cookie', lecturerACookie)
      .send({ name: 'Tampered Topic B' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  test('S3: Lecturer A CANNOT move Topic A into unassigned Subject B -> 403 FORBIDDEN', async () => {
    const res = await request(app)
      .patch(`/api/topics/${topicAId}`)
      .set('Cookie', lecturerACookie)
      .send({ subject_id: subjectBId });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  test('S3: Lecturer A can update Topic A with valid name -> 200', async () => {
    const res = await request(app)
      .patch(`/api/topics/${topicAId}`)
      .set('Cookie', lecturerACookie)
      .send({ name: 'Updated Topic A' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Updated Topic A');
  });

  test('S3: Lecturer A CANNOT delete Topic B -> 403 FORBIDDEN', async () => {
    const res = await request(app)
      .delete(`/api/topics/${topicBId}`)
      .set('Cookie', lecturerACookie);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  test('S3: Admin has full access to all topics regardless of subject', async () => {
    // Admin can read Topic B
    const readRes = await request(app)
      .get(`/api/topics/${topicBId}`)
      .set('Cookie', adminCookie);
    expect(readRes.status).toBe(200);

    // Admin can update Topic B
    const updateRes = await request(app)
      .patch(`/api/topics/${topicBId}`)
      .set('Cookie', adminCookie)
      .send({ name: 'Admin Renamed B' });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.name).toBe('Admin Renamed B');

    // Admin lists all topics including Topic B
    const listRes = await request(app)
      .get('/api/topics')
      .set('Cookie', adminCookie);
    expect(listRes.status).toBe(200);
    const ids = listRes.body.map((t) => t.topic_id);
    expect(ids).toContain(topicAId);
    expect(ids).toContain(topicBId);
    expect(ids).toContain(legacyTopicId);
  });
});
