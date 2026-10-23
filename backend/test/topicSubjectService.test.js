const test = require('node:test');
const assert = require('node:assert/strict');
const { TopicService } = require('../src/services/topicService');
const { SubjectScope } = require('../src/services/subjectScope');

function fakeRepository() {
  const calls = [];
  return {
    calls,
    async create(row) {
      calls.push(['create', row]);
      return { topic_id: 1, ...row };
    },
    async update(id, patch) {
      calls.push(['update', id, patch]);
      return { topic_id: id, name: 'x', ...patch };
    },
  };
}

test('createTopic stores the subject the topic belongs to (subject_id or subjectId)', async () => {
  const repository = fakeRepository();
  const service = new TopicService({ repository });
  const a = await service.createTopic({ name: ' Layers ', subject_id: '4' });
  const b = await service.createTopic({ name: 'Patterns', subjectId: 7 });
  const c = await service.createTopic({ name: 'Legacy' });
  assert.equal(a.subject_id, 4);
  assert.equal(b.subject_id, 7);
  assert.equal(c.subject_id, null);
  assert.deepEqual(repository.calls[0], ['create', { name: 'Layers', course_id: null, subject_id: 4 }]);
});

test('createTopic rejects an invalid subject_id', async () => {
  const service = new TopicService({ repository: fakeRepository() });
  for (const subject_id of ['abc', 0, -1, 1.5]) {
    await assert.rejects(() => service.createTopic({ name: 'X', subject_id }), /subject_id/);
  }
});

test('updateTopic can move a topic into a subject', async () => {
  const repository = fakeRepository();
  const service = new TopicService({ repository });
  const updated = await service.updateTopic(3, { subject_id: 4 });
  assert.equal(updated.subject_id, 4);
  assert.deepEqual(repository.calls[0], ['update', 3, { subject_id: 4 }]);
});

// --- Subject scoping tests ---

const IN_SCOPE_SUBJECT = 42;
const OUT_OF_SCOPE_SUBJECT = 99;
const LECTURER = { id: 7, role: 'LECTURER' };
const ADMIN = { id: 1, role: 'ADMIN' };

class ScopedTopicRepo {
  constructor() {
    this.rows = new Map([
      [1, { topic_id: 1, name: 'In Scope Topic', course_id: 'SWD392', subject_id: IN_SCOPE_SUBJECT }],
      [2, { topic_id: 2, name: 'Out Scope Topic', course_id: 'PRN211', subject_id: OUT_OF_SCOPE_SUBJECT }],
      [3, { topic_id: 3, name: 'Legacy Topic', course_id: null, subject_id: null }],
    ]);
  }

  async list() {
    return [...this.rows.values()].map((r) => ({ ...r }));
  }

  async getById(id) {
    const row = this.rows.get(Number(id));
    return row ? { ...row } : null;
  }

  async create(row) {
    const id = this.rows.size + 1;
    const created = { topic_id: id, ...row };
    this.rows.set(id, created);
    return { ...created };
  }

  async update(id, patch) {
    const existing = this.rows.get(Number(id));
    if (!existing) return null;
    const updated = { ...existing, ...patch };
    this.rows.set(Number(id), updated);
    return { ...updated };
  }

  async delete(id) {
    const existing = this.rows.get(Number(id));
    if (!existing) return null;
    this.rows.delete(Number(id));
    return { ...existing };
  }
}

function createScopedService() {
  const repository = new ScopedTopicRepo();
  const subjectRepository = {
    async listSubjectIdsForLecturer(userId) {
      return userId === LECTURER.id ? [IN_SCOPE_SUBJECT] : [];
    },
  };
  const subjectScope = new SubjectScope({ subjectRepository });
  return { service: new TopicService({ repository, subjectScope }), repository };
}

test('topicService listTopics filters out topics from unassigned subjects for LECTURER', async () => {
  const { service } = createScopedService();
  const list = await service.listTopics(LECTURER);
  const ids = list.map((t) => t.topic_id);
  assert.ok(ids.includes(1), 'In-scope topic should be visible');
  assert.ok(!ids.includes(2), 'Out-of-scope topic should NOT be visible');
  assert.ok(ids.includes(3), 'Legacy topic without subject should be visible');
});

test('topicService listTopics returns all topics for ADMIN', async () => {
  const { service } = createScopedService();
  const list = await service.listTopics(ADMIN);
  assert.equal(list.length, 3);
});

test('topicService getTopic allows in-scope topic and denies out-of-scope topic with 403', async () => {
  const { service } = createScopedService();
  const inScope = await service.getTopic(1, LECTURER);
  assert.equal(inScope.topic_id, 1);

  const legacy = await service.getTopic(3, LECTURER);
  assert.equal(legacy.topic_id, 3);

  await assert.rejects(
    () => service.getTopic(2, LECTURER),
    (err) => err.statusCode === 403 && err.code === 'FORBIDDEN',
  );

  const adminGet = await service.getTopic(2, ADMIN);
  assert.equal(adminGet.topic_id, 2);
});

test('topicService createTopic allows in-scope subject and denies out-of-scope subject with 403', async () => {
  const { service } = createScopedService();
  const created = await service.createTopic({ name: 'New In-Scope', subject_id: IN_SCOPE_SUBJECT }, LECTURER);
  assert.equal(created.subject_id, IN_SCOPE_SUBJECT);

  await assert.rejects(
    () => service.createTopic({ name: 'New Out-of-Scope', subject_id: OUT_OF_SCOPE_SUBJECT }, LECTURER),
    (err) => err.statusCode === 403 && err.code === 'FORBIDDEN',
  );

  const adminCreated = await service.createTopic({ name: 'Admin Any', subject_id: OUT_OF_SCOPE_SUBJECT }, ADMIN);
  assert.equal(adminCreated.subject_id, OUT_OF_SCOPE_SUBJECT);
});

test('topicService updateTopic guards both existing topic subject and target subject', async () => {
  const { service } = createScopedService();
  // Updating in-scope topic with new name: OK
  const updated = await service.updateTopic(1, { name: 'Renamed In-Scope' }, LECTURER);
  assert.equal(updated.name, 'Renamed In-Scope');

  // Updating out-of-scope topic: 403
  await assert.rejects(
    () => service.updateTopic(2, { name: 'Hack Name' }, LECTURER),
    (err) => err.statusCode === 403 && err.code === 'FORBIDDEN',
  );

  // Moving in-scope topic to an out-of-scope subject: 403
  await assert.rejects(
    () => service.updateTopic(1, { subject_id: OUT_OF_SCOPE_SUBJECT }, LECTURER),
    (err) => err.statusCode === 403 && err.code === 'FORBIDDEN',
  );

  // Admin can update anything
  const adminUpdated = await service.updateTopic(2, { name: 'Admin OK' }, ADMIN);
  assert.equal(adminUpdated.name, 'Admin OK');
});

test('topicService deleteTopic denies deleting out-of-scope topic with 403', async () => {
  const { service, repository } = createScopedService();
  await assert.rejects(
    () => service.deleteTopic(2, LECTURER),
    (err) => err.statusCode === 403 && err.code === 'FORBIDDEN',
  );
  assert.ok(repository.rows.has(2), 'Topic 2 must not be deleted');

  // Lecturer can delete in-scope topic
  await service.deleteTopic(1, LECTURER);
  assert.ok(!repository.rows.has(1), 'Topic 1 should be deleted');
});
