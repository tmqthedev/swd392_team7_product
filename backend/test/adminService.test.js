const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');

const { AdminService } = require('../src/services/adminService');

const TEST_ENV = {
  appBaseUrl: 'http://localhost:8080',
  passwordSetTtlHours: 72,
};

class FakeUserRepo {
  constructor(users = []) {
    this.users = new Map(users.map((u) => [u.app_user_id, { ...u }]));
    this.nextId = Math.max(0, ...users.map((u) => u.app_user_id)) + 1;
  }

  async create({ code, email, fullName, passwordHash, role, status }) {
    const row = {
      app_user_id: this.nextId++,
      code: code ?? null,
      email,
      full_name: fullName ?? null,
      password_hash: passwordHash ?? null,
      role,
      status: status ?? 'ACTIVE',
      locked_until: null,
      failed_login_count: 0,
      must_change_password: false,
      last_login_at: null,
    };
    this.users.set(row.app_user_id, row);
    return { ...row };
  }

  async findById(id) {
    const u = this.users.get(Number(id));
    return u ? { ...u } : null;
  }

  async findByEmail(email) {
    for (const u of this.users.values()) if (u.email === email) return { ...u };
    return null;
  }

  async findByCode(code) {
    for (const u of this.users.values()) if (u.code === code) return { ...u };
    return null;
  }

  async list({ role } = {}) {
    const all = [...this.users.values()];
    return (role ? all.filter((u) => u.role === role) : all).map((u) => ({ ...u }));
  }

  async update(id, patch) {
    const u = this.users.get(Number(id));
    if (!u) return null;
    Object.assign(u, patch);
    return { ...u };
  }
}

class FakeSubjectRepo {
  constructor(subjects = []) {
    this.subjects = new Map(subjects.map((s) => [s.subject_id, { ...s }]));
    this.nextId = Math.max(0, ...subjects.map((s) => s.subject_id)) + 1;
    this.lecturers = new Map(); // subjectId -> [lecturerId]
    this.students = new Map(); // subjectId -> [studentId]
  }

  async setStudents(subjectId, studentIds) {
    const ids = Array.from(new Set((studentIds || []).filter((x) => x != null)));
    this.students.set(Number(subjectId), ids);
    return ids;
  }

  async listStudents(subjectId) {
    const ids = this.students.get(Number(subjectId)) || [];
    return ids.map((id) => ({
      app_user_id: id,
      code: `STU${id}`,
      email: `stu${id}@aives.local`,
      full_name: `Student ${id}`,
      role: 'STUDENT',
      status: 'ACTIVE',
    }));
  }

  async create({ code, name }) {
    const row = { subject_id: this.nextId++, code, name };
    this.subjects.set(row.subject_id, row);
    return { ...row };
  }

  async findById(id) {
    const s = this.subjects.get(Number(id));
    return s ? { ...s } : null;
  }

  async list() {
    return [...this.subjects.values()].map((s) => ({ ...s }));
  }

  async update(id, patch) {
    const s = this.subjects.get(Number(id));
    if (!s) return null;
    Object.assign(s, patch);
    return { ...s };
  }

  async remove(id) {
    const s = this.subjects.get(Number(id));
    if (!s) return null;
    this.subjects.delete(Number(id));
    return { ...s };
  }

  async setLecturers(subjectId, lecturerIds) {
    const ids = Array.from(new Set((lecturerIds || []).filter((x) => x != null)));
    this.lecturers.set(Number(subjectId), ids);
    return ids;
  }
}

class FakeTokenRepo {
  constructor() { this.tokens = []; this.nextId = 1; }

  async create({ userId, tokenHash, purpose, expiresAt }) {
    const row = {
      password_token_id: this.nextId++, user_id: userId, token_hash: tokenHash, purpose, expires_at: expiresAt, used_at: null,
    };
    this.tokens.push(row);
    return row;
  }

  async invalidateActiveForUser(userId, purpose) {
    for (const t of this.tokens) {
      if (t.user_id === userId && t.purpose === purpose && !t.used_at) t.used_at = new Date();
    }
  }
}

class FakeJobRepo {
  constructor() { this.jobs = []; }

  async enqueue(type, payload) {
    const row = { background_job_id: this.jobs.length + 1, type, payload };
    this.jobs.push(row);
    return row;
  }
}

function build({ users = [], subjects = [] } = {}) {
  const appUserRepository = new FakeUserRepo(users);
  const subjectRepository = new FakeSubjectRepo(subjects);
  const passwordTokenRepository = new FakeTokenRepo();
  const backgroundJobRepository = new FakeJobRepo();
  const service = new AdminService({
    appUserRepository,
    subjectRepository,
    passwordTokenRepository,
    backgroundJobRepository,
    env: TEST_ENV,
  });
  return {
    service, appUserRepository, subjectRepository, passwordTokenRepository, backgroundJobRepository,
  };
}

async function buildXlsx(rows, { header = ['Student Code', 'Full Name', 'Email'] } = {}) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Students');
  ws.addRow(header);
  for (const r of rows) ws.addRow(r);
  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

// --- createLecturer -----------------------------------------------------------

test('createLecturer enqueues a SET email with a link and no plaintext password', async () => {
  const { service, backgroundJobRepository, appUserRepository } = build();
  const user = await service.createLecturer({ code: 'L001', email: 'lec@aives.local', fullName: 'Lec One' });
  assert.equal(user.role, 'LECTURER');
  assert.equal(user.email, 'lec@aives.local');

  const stored = await appUserRepository.findByEmail('lec@aives.local');
  assert.equal(stored.password_hash, null);

  assert.equal(backgroundJobRepository.jobs.length, 1);
  const job = backgroundJobRepository.jobs[0];
  assert.equal(job.type, 'SEND_EMAIL');
  assert.equal(job.payload.to, 'lec@aives.local');
  assert.equal(job.payload.template, 'SET_PASSWORD');
  assert.ok(job.payload.variables.link.includes('/set-password?token='));
  // No plaintext password anywhere in the payload.
  const serialized = JSON.stringify(job.payload).toLowerCase();
  assert.equal(serialized.includes('password_hash'), false);
  assert.equal('password' in job.payload, false);
});

test('createLecturer rejects a duplicate email', async () => {
  const { service } = build({ users: [{
    app_user_id: 1, code: 'X', email: 'dup@aives.local', full_name: 'X', role: 'LECTURER', status: 'ACTIVE',
  }] });
  await assert.rejects(
    () => service.createLecturer({ code: 'L9', email: 'dup@aives.local', fullName: 'Dup' }),
    (err) => err.statusCode === 409,
  );
});

// --- importStudents: all-or-nothing ------------------------------------------

test('importStudents writes everything when all rows are valid', async () => {
  const { service, appUserRepository, backgroundJobRepository } = build();
  const buffer = await buildXlsx([
    ['S001', 'Alice', 'alice@aives.local'],
    ['S002', 'Bob', 'bob@aives.local'],
  ]);
  const result = await service.importStudents(buffer);
  assert.equal(result.ok, true);
  assert.equal(result.created.length, 2);
  const all = await appUserRepository.list({ role: 'STUDENT' });
  assert.equal(all.length, 2);
  // One SET email per created student.
  assert.equal(backgroundJobRepository.jobs.length, 2);
});

test('importStudents performs ZERO writes when any row is invalid and returns per-row errors', async () => {
  const { service, appUserRepository, backgroundJobRepository } = build();
  const buffer = await buildXlsx([
    ['S001', 'Alice', 'alice@aives.local'],
    ['S002', '', 'not-an-email'], // missing name + bad email
    ['S003', 'Carol', 'carol@aives.local'],
  ]);
  const result = await service.importStudents(buffer);
  assert.equal(result.ok, false);
  assert.ok(Array.isArray(result.errors));
  const badRow = result.errors.find((e) => e.row === 3); // 1 header + row index
  assert.ok(badRow);
  assert.ok(badRow.errors.length >= 2);

  // Nothing was written and no emails enqueued.
  const all = await appUserRepository.list();
  assert.equal(all.length, 0);
  assert.equal(backgroundJobRepository.jobs.length, 0);
});

test('importStudents rejects in-file duplicate codes with zero writes', async () => {
  const { service, appUserRepository } = build();
  const buffer = await buildXlsx([
    ['S001', 'Alice', 'alice@aives.local'],
    ['S001', 'Bob', 'bob@aives.local'],
  ]);
  const result = await service.importStudents(buffer);
  assert.equal(result.ok, false);
  const all = await appUserRepository.list();
  assert.equal(all.length, 0);
});

test('importStudents rejects a code/email that already exists in the DB', async () => {
  const { service } = build({ users: [{
    app_user_id: 1, code: 'S001', email: 'existing@aives.local', full_name: 'E', role: 'STUDENT', status: 'ACTIVE',
  }] });
  const buffer = await buildXlsx([
    ['S001', 'Alice', 'alice@aives.local'],
  ]);
  const result = await service.importStudents(buffer);
  assert.equal(result.ok, false);
  assert.ok(result.errors[0].errors.some((m) => m.toLowerCase().includes('student code')));
});

// --- subjects + lecturer assignment ------------------------------------------

test('subject CRUD lifecycle', async () => {
  const { service } = build();
  const created = await service.createSubject({ code: 'CS101', name: 'Intro' });
  assert.equal(created.code, 'CS101');
  const updated = await service.updateSubject(created.id, { name: 'Intro to CS' });
  assert.equal(updated.name, 'Intro to CS');
  const list = await service.listSubjects();
  assert.equal(list.length, 1);
  const del = await service.deleteSubject(created.id);
  assert.equal(del.ok, true);
  assert.equal((await service.listSubjects()).length, 0);
});

test('assignLecturers replaces the full set', async () => {
  const { service, subjectRepository } = build({ subjects: [{ subject_id: 1, code: 'CS', name: 'CS' }] });
  await service.assignLecturers(1, [10, 11]);
  assert.deepEqual(subjectRepository.lecturers.get(1), [10, 11]);
  const result = await service.assignLecturers(1, [12]);
  assert.deepEqual(result.lecturerIds, [12]);
  assert.deepEqual(subjectRepository.lecturers.get(1), [12]);
});

test('assignStudents enrolls students by codes all-or-nothing', async () => {
  const { service, subjectRepository } = build({
    subjects: [{ subject_id: 1, code: 'CS', name: 'CS' }],
    users: [
      { app_user_id: 201, code: 'SE101', email: 's1@aives.local', role: 'STUDENT', status: 'ACTIVE' },
      { app_user_id: 202, code: 'SE102', email: 's2@aives.local', role: 'STUDENT', status: 'ACTIVE' },
    ],
  });

  // Invalid code fails with zero writes
  const fail = await service.assignStudents(1, { codes: 'SE101, NONEXISTENT' });
  assert.equal(fail.ok, false);
  assert.equal(fail.errors.length, 1);
  assert.equal(subjectRepository.students.get(1), undefined);

  // Success writes all
  const success = await service.assignStudents(1, { codes: 'SE101\nSE102' });
  assert.equal(success.ok, true);
  assert.deepEqual(subjectRepository.students.get(1), [201, 202]);

  const list = await service.listSubjectStudents(1);
  assert.equal(list.students.length, 2);
});

test('assignStudents enrolls students by studentIds', async () => {
  const { service, subjectRepository } = build({
    subjects: [{ subject_id: 1, code: 'CS', name: 'CS' }],
    users: [
      { app_user_id: 201, code: 'SE101', email: 's1@aives.local', role: 'STUDENT', status: 'ACTIVE' },
    ],
  });

  const res = await service.assignStudents(1, { studentIds: [201] });
  assert.equal(res.ok, true);
  assert.deepEqual(subjectRepository.students.get(1), [201]);

  const bad = await service.assignStudents(1, { studentIds: [999] });
  assert.equal(bad.ok, false);
});

test('assignStudents rejects invalid payload with VALIDATION_ERROR', async () => {
  const { service } = build({
    subjects: [{ subject_id: 1, code: 'CS', name: 'CS' }],
  });
  await assert.rejects(
    () => service.assignStudents(1, {}),
    (err) => { assert.equal(err.statusCode, 400); assert.equal(err.code, 'VALIDATION_ERROR'); return true; }
  );
  await assert.rejects(
    () => service.assignStudents(1, { studentIds: 'not-an-array' }),
    (err) => { assert.equal(err.statusCode, 400); assert.equal(err.code, 'VALIDATION_ERROR'); return true; }
  );
});

test('assignStudents allows explicitly clearing enrollments with studentIds: []', async () => {
  const { service, subjectRepository } = build({
    subjects: [{ subject_id: 1, code: 'CS', name: 'CS' }],
    users: [
      { app_user_id: 201, code: 'SE101', email: 's1@aives.local', role: 'STUDENT', status: 'ACTIVE' },
    ],
  });
  await service.assignStudents(1, { studentIds: [201] });
  assert.deepEqual(subjectRepository.students.get(1), [201]);

  const cleared = await service.assignStudents(1, { studentIds: [] });
  assert.equal(cleared.ok, true);
  assert.deepEqual(subjectRepository.students.get(1), []);
});

test('unlockUser clears lock state and sets status ACTIVE', async () => {
  const { service } = build({ users: [{
    app_user_id: 5, code: 'U5', email: 'u5@aives.local', full_name: 'U5', role: 'STUDENT',
    status: 'LOCKED', locked_until: new Date(Date.now() + 60000), failed_login_count: 5,
  }] });
  const user = await service.unlockUser(5);
  assert.equal(user.status, 'ACTIVE');
  assert.equal(user.lockedUntil, null);
});
