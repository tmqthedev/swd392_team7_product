/**
 * Migration-runner E2E (Jest). Requires a real Postgres with the `vector`
 * extension available (pgvector/pgvector:pg16).
 *
 * Self-skips when TEST_DATABASE_URL (or DATABASE_URL) is unset, so
 * `npm run test:e2e` stays green without Docker. Run against the local stack:
 *   docker compose up -d postgres
 *   $env:TEST_DATABASE_URL='postgres://aives:aives@localhost:5432/aives'
 *   npm run test:e2e
 */
const path = require('path');
const { Pool } = require('pg');
const { runMigrations } = require('../src/db/migrationRunner');

const DB_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
const MIGRATIONS_DIR = path.resolve(__dirname, '..', 'db', 'migrations');

// Every table authored across the unified-model migrations (FEAT-001).
const EXPECTED_TABLES = [
  'app_user',
  'auth_session',
  'password_token',
  'subject',
  'subject_lecturer',
  'course_material',
  'material_chunk',
  'performance_level',
  'question_generation_job',
  'question_source_ref',
  'exam_session',
  'exam_session_student',
  'exam_session_examiner',
  'viva_interview',
  'assigned_question',
  'qa_turn',
  'transcript',
  'processing_failure',
  'viva_result',
  'question_evaluation',
  'criterion_score',
  'score_adjustment',
  'background_job',
];

const describeOrSkip = DB_URL ? describe : describe.skip;

describeOrSkip('migrations e2e (requires Postgres)', () => {
  jest.setTimeout(60000);
  let pool;

  beforeAll(async () => {
    pool = new Pool({ connectionString: DB_URL });
    await runMigrations({ pool, dir: MIGRATIONS_DIR, logger: { info() {} } });
  });

  afterAll(async () => {
    if (pool) await pool.end();
  });

  test('every unified-model table exists', async () => {
    const { rows } = await pool.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public'`,
    );
    const present = new Set(rows.map((r) => r.table_name));
    for (const table of EXPECTED_TABLES) {
      expect(present.has(table)).toBe(true);
    }
  });

  test('pgvector extension and material_chunk HNSW index exist', async () => {
    const ext = await pool.query("SELECT 1 FROM pg_extension WHERE extname = 'vector'");
    expect(ext.rowCount).toBe(1);

    const idx = await pool.query(
      `SELECT indexdef FROM pg_indexes
       WHERE tablename = 'material_chunk' AND indexdef ILIKE '%hnsw%'`,
    );
    expect(idx.rowCount).toBeGreaterThanOrEqual(1);
    expect(idx.rows[0].indexdef.toLowerCase()).toContain('hnsw');
  });

  test('re-running migrations applies zero new versions (idempotent)', async () => {
    const result = await runMigrations({ pool, dir: MIGRATIONS_DIR, logger: { info() {} } });
    expect(result.applied).toEqual([]);
  });

  test('question status CHECK accepts APPROVED and rejects legacy Active', async () => {
    // A fresh topic to satisfy the NOT NULL FK on question.topic_id.
    const topic = await pool.query(
      "INSERT INTO topic (name) VALUES ('migration-e2e-topic') RETURNING topic_id",
    );
    const topicId = topic.rows[0].topic_id;

    const approved = await pool.query(
      `INSERT INTO question (topic_id, content, status)
       VALUES ($1, $2, 'APPROVED') RETURNING question_id, status`,
      [topicId, `migration-e2e approved ${Date.now()}`],
    );
    expect(approved.rows[0].status).toBe('APPROVED');

    await expect(
      pool.query(
        `INSERT INTO question (topic_id, content, status)
         VALUES ($1, $2, 'Active')`,
        [topicId, `migration-e2e legacy ${Date.now()}`],
      ),
    ).rejects.toThrow();
  });
});
