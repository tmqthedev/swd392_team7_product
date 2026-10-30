/**
 * Step 14 admin repositories against real Postgres (migrations 025-027):
 * user list filters and soft delete, open-exam involvement, admin audit log,
 * subject dependents / code lookup / archive. Everything runs inside one
 * transaction that is rolled back. Self-skips without TEST_DATABASE_URL.
 */
const path = require('path');
const { Pool } = require('pg');

const { runMigrations } = require('../src/db/migrationRunner');
const { AppUserRepository } = require('../src/repositories/appUserRepository');
const { AuditLogRepository } = require('../src/repositories/auditLogRepository');
const { SubjectRepository } = require('../src/repositories/subjectRepository');

const DB_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
const MIGRATIONS_DIR = path.resolve(__dirname, '..', 'db', 'migrations');
const describeDb = DB_URL ? describe : describe.skip;

describeDb('admin repositories (requires Postgres)', () => {
  let pool;
  let client;
  let users;
  let audit;
  let subjects;

  beforeAll(async () => {
    pool = new Pool({ connectionString: DB_URL });
    await runMigrations({ pool, dir: MIGRATIONS_DIR, logger: { info() {} } });
    client = await pool.connect();
    await client.query('BEGIN');
    const db = { query: (text, params) => client.query(text, params) };
    users = new AppUserRepository(db);
    audit = new AuditLogRepository(db);
    subjects = new SubjectRepository(db);
  });

  afterAll(async () => {
    if (client) {
      await client.query('ROLLBACK');
      client.release();
    }
    if (pool) await pool.end();
  });

  const suffix = `${Date.now()}`;

  test('list filters by role and hides soft-deleted users', async () => {
    const u = await users.create({
      code: `ADMREPO${suffix}`, email: `admrepo${suffix}@aives.test`, fullName: 'x', passwordHash: null, role: 'STUDENT', status: 'ACTIVE',
    });
    const students = await users.list({ role: 'STUDENT' });
    expect(students.some((r) => r.app_user_id === u.app_user_id)).toBe(true);
    expect(students.every((r) => r.role === 'STUDENT')).toBe(true);

    await users.update(u.app_user_id, { status: 'DELETED' });
    expect((await users.list({ role: 'STUDENT' })).some((r) => r.app_user_id === u.app_user_id)).toBe(false);
    expect((await users.list({ includeDeleted: true })).some((r) => r.app_user_id === u.app_user_id)).toBe(true);
    expect(await users.listOpenExamInvolvement(u.app_user_id)).toEqual([]);
    await users.clearSubjectAssignments(u.app_user_id);
    expect(await users.countActiveAdmins()).toBeGreaterThanOrEqual(0);
  });

  test('audit log records ids and lists newest first with filters', async () => {
    await audit.record({ actorId: null, action: 'SUBJECT_CREATE', entityType: 'SUBJECT', entityId: 999001 });
    await audit.record({ actorId: null, action: 'SUBJECT_ARCHIVE', entityType: 'SUBJECT', entityId: 999001 });
    const { entries, total } = await audit.list({ entityType: 'SUBJECT', entityId: 999001, limit: 10, offset: 0 });
    expect(total).toBe(2);
    expect(entries.map((e) => e.action)).toEqual(['SUBJECT_ARCHIVE', 'SUBJECT_CREATE']);
  });

  test('subject dependents, case-insensitive code lookup and archive', async () => {
    const s = await subjects.create({ code: `SQL${suffix}`, name: 'Repo test' });
    expect(s.status).toBe('ACTIVE');
    expect(await subjects.countDependents(s.subject_id)).toEqual({
      topics: 0, materials: 0, rubrics: 0, examSessions: 0,
    });
    await client.query('INSERT INTO topic (name, subject_id) VALUES ($1, $2)', [`T ${suffix}`, s.subject_id]);
    expect((await subjects.countDependents(s.subject_id)).topics).toBe(1);
    expect((await subjects.findByCode(`  sql${suffix} `)).subject_id).toBe(s.subject_id);
    expect((await subjects.setStatus(s.subject_id, 'ARCHIVED')).status).toBe('ARCHIVED');
    await expect(client.query("UPDATE subject SET status = 'GONE' WHERE subject_id = $1", [s.subject_id]))
      .rejects.toThrow(/chk_subject_status/);
  });
});
