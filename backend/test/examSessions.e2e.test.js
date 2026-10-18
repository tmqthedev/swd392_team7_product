/**
 * Step 5 exam-session API E2E (Jest + Supertest).
 *
 * The DB-backed flow requires a real Postgres (the in-memory mock DB does NOT
 * model exam_session SQL). It self-skips when TEST_DATABASE_URL (or
 * DATABASE_URL) is unset, so `npm run test:e2e` stays green offline. Run it:
 *   docker compose up -d postgres
 *   $env:TEST_DATABASE_URL='postgres://aives:aives@localhost:5432/aives'
 *   npm run test:e2e
 *
 * It exercises the real router + controller + service against real SQL with the
 * MOCK adapters only (mock TTS; never a real Google call):
 *   create -> set students (valid + unknown-code 422) -> set examiners
 *   -> open (NOT_ENOUGH_QUESTIONS 409, then success + rubric locked) -> close
 *
 * The FEAT-001 F2 assertions (/api/topics, /api/evaluations,
 * /api/lecturer/sessions return 401 unauthenticated) run OFFLINE and so are
 * kept outside the DB gate.
 */
const path = require('path');
const request = require('supertest');
const pino = require('pino');
const { Pool } = require('pg');

const { createApp } = require('../src/app');
const { InMemoryDatabase } = require('../src/db/createDatabase');
const { runMigrations } = require('../src/db/migrationRunner');
const { ACCESS_COOKIE } = require('../src/auth/cookieNames');

const DB_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
const MIGRATIONS_DIR = path.resolve(__dirname, '..', 'db', 'migrations');
const describeDb = DB_URL ? describe : describe.skip;

// Minimal { query, withTransaction } wrapper over a pg Pool, mirroring the
// production PgDatabase so the repositories run their real SQL.
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

// --- FEAT-001 F2: legacy mounts behind requireAuth (offline-safe) ------------

describe('legacy mounts require auth (offline)', () => {
  function offlineApp() {
    return createApp({
      env: { awsMockMode: true, dbMockMode: true },
      database: new InMemoryDatabase({ persist: false }),
      logger: pino({ level: 'silent' }),
    });
  }

  test('GET /api/topics without auth -> 401', async () => {
    const res = await request(offlineApp()).get('/api/topics');
    expect(res.status).toBe(401);
  });

  test('GET /api/evaluations without auth -> 401', async () => {
    const res = await request(offlineApp()).get('/api/evaluations');
    expect(res.status).toBe(401);
  });

  test('GET /api/lecturer/sessions without auth -> 401', async () => {
    const res = await request(offlineApp()).get('/api/lecturer/sessions');
    expect(res.status).toBe(401);
  });
});

describeDb('exam-sessions API e2e (requires Postgres)', () => {
  jest.setTimeout(60000);

  let pool;
  let db;
  let app;
  let cookie;

  let lecturerId;
  let subjectId;
  let topicId;
  let rubricId;
  const studentCodes = [];
  let examinerId;

  beforeAll(async () => {
    pool = new Pool({ connectionString: DB_URL });
    await runMigrations({ pool, dir: MIGRATIONS_DIR, logger: { info() {} } });
    db = wrapPool(pool);

    const env = {
      awsMockMode: true,
      dbMockMode: false,
      ttsProvider: 'mock',
    };
    app = createApp({
      env,
      database: db,
      logger: pino({ level: 'silent' }),
    });

    const suffix = Date.now();

    const lecturer = await pool.query(
      `INSERT INTO app_user (email, full_name, role, status)
       VALUES ($1, 'Step5 Lecturer', 'LECTURER', 'ACTIVE') RETURNING app_user_id`,
      [`step5-lecturer-${suffix}@aives.local`],
    );
    lecturerId = lecturer.rows[0].app_user_id;

    const examiner = await pool.query(
      `INSERT INTO app_user (email, full_name, role, status)
       VALUES ($1, 'Step5 Examiner', 'LECTURER', 'ACTIVE') RETURNING app_user_id`,
      [`step5-examiner-${suffix}@aives.local`],
    );
    examinerId = examiner.rows[0].app_user_id;

    // Two students (resolved by code) + a non-student for the roster checks.
    for (let i = 1; i <= 2; i += 1) {
      const code = `STU-${suffix}-${i}`;
      // eslint-disable-next-line no-await-in-loop
      await pool.query(
        `INSERT INTO app_user (code, email, full_name, role, status)
         VALUES ($1, $2, 'Step5 Student', 'STUDENT', 'ACTIVE')`,
        [code, `${code}@aives.local`],
      );
      studentCodes.push(code);
    }

    const subject = await pool.query(
      'INSERT INTO subject (code, name) VALUES ($1, $2) RETURNING subject_id',
      [`S5-${suffix}`, 'Step5 Subject'],
    );
    subjectId = subject.rows[0].subject_id;
    await pool.query(
      'INSERT INTO subject_lecturer (subject_id, lecturer_id) VALUES ($1, $2)',
      [subjectId, lecturerId],
    );

    const topic = await pool.query(
      'INSERT INTO topic (name, subject_id) VALUES ($1, $2) RETURNING topic_id',
      [`Step5 Topic ${suffix}`, subjectId],
    );
    topicId = topic.rows[0].topic_id;

    const rubric = await pool.query(
      'INSERT INTO rubric (max_score, subject_id, created_by) VALUES (10, $1, $2) RETURNING rubric_id',
      [subjectId, lecturerId],
    );
    rubricId = rubric.rows[0].rubric_id;

    const { token } = app.authContext.tokenService.signAccess({ sub: lecturerId, role: 'LECTURER' });
    cookie = `${ACCESS_COOKIE}=${token}`;
  });

  afterAll(async () => {
    if (pool) await pool.end();
  });

  let examSessionId;

  test('create -> 201 DRAFT with Nhom-3 defaults', async () => {
    const res = await request(app)
      .post('/api/exam-sessions')
      .set('Cookie', cookie)
      .send({
        subjectId, topicId, title: 'Midterm Viva', language: 'EN',
      });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('DRAFT');
    expect(res.body.main_question_count).toBe(3);
    expect(res.body.max_follow_ups_per_question).toBe(2);
    expect(res.body.session_time_limit_sec).toBe(1800);
    examSessionId = res.body.exam_session_id;
  });

  test('set students: unknown code -> 422 all-or-nothing', async () => {
    const res = await request(app)
      .put(`/api/exam-sessions/${examSessionId}/students`)
      .set('Cookie', cookie)
      .send({ codes: `${studentCodes[0]}\nNO-SUCH-CODE` });
    expect(res.status).toBe(422);
    expect(res.body.ok).toBe(false);
    expect(res.body.errors[0].code).toBe('NO-SUCH-CODE');

    const after = await pool.query(
      'SELECT COUNT(*)::int AS count FROM exam_session_student WHERE exam_session_id = $1',
      [examSessionId],
    );
    expect(after.rows[0].count).toBe(0);
  });

  test('set students: valid list -> writes roster', async () => {
    const res = await request(app)
      .put(`/api/exam-sessions/${examSessionId}/students`)
      .set('Cookie', cookie)
      .send({ codes: studentCodes.join('\n') });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.students).toHaveLength(2);
  });

  test('set examiners -> writes examiner rows', async () => {
    const res = await request(app)
      .put(`/api/exam-sessions/${examSessionId}/examiners`)
      .set('Cookie', cookie)
      .send({ lecturerIds: [examinerId] });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.examiners).toContain(examinerId);
  });

  test('open: NOT_ENOUGH_QUESTIONS 409 before enough APPROVED questions', async () => {
    const res = await request(app)
      .post(`/api/exam-sessions/${examSessionId}/open`)
      .set('Cookie', cookie)
      .send();
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('NOT_ENOUGH_QUESTIONS');
  });

  test('open: success + rubric locked once enough APPROVED questions exist', async () => {
    // Seed 3 APPROVED questions in the topic, all using the rubric.
    for (let i = 1; i <= 3; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await pool.query(
        `INSERT INTO question (topic_id, rubric_id, content, status, source)
         VALUES ($1, $2, $3, 'APPROVED', 'AI')`,
        [topicId, rubricId, `Approved Q${i} ${Date.now()}`],
      );
    }

    const res = await request(app)
      .post(`/api/exam-sessions/${examSessionId}/open`)
      .set('Cookie', cookie)
      .send();
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('OPEN');
    expect(res.body.opens_at).toBeTruthy();

    const locked = await pool.query('SELECT is_locked FROM rubric WHERE rubric_id = $1', [rubricId]);
    expect(locked.rows[0].is_locked).toBe(true);
  });

  test('close: OPEN -> CLOSED', async () => {
    const res = await request(app)
      .post(`/api/exam-sessions/${examSessionId}/close`)
      .set('Cookie', cookie)
      .send();
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('CLOSED');
    expect(res.body.closes_at).toBeTruthy();
  });
});
