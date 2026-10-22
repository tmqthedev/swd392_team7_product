const test = require('node:test');
const assert = require('node:assert/strict');
const { TopicService } = require('../src/services/topicService');

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
