const test = require('node:test');
const assert = require('node:assert/strict');
const { InMemoryDatabase } = require('../src/db/createDatabase');
const { QuestionRepository } = require('../src/repositories/questionRepository');
const { QuestionService } = require('../src/services/questionService');

function createService() {
  const repository = new QuestionRepository(new InMemoryDatabase({ persist: false }));
  return new QuestionService({ repository });
}

test('creates and lists a question', async () => {
  const service = createService();

  const created = await service.createQuestion({
    topicId: 1,
    content: 'Explain OOP in Java.',
    status: 'Active',
  });

  assert.equal(created.id, 1);
  assert.equal(created.topicId, 1);
  assert.equal(created.content, 'Explain OOP in Java.');
  assert.equal(created.status, 'Active');
  assert.equal(created.rubricId, null);

  const list = await service.listQuestions();
  assert.equal(list.length, 1);
});

test('rejects duplicate question content (case-insensitive)', async () => {
  const service = createService();

  await service.createQuestion({
    topicId: 1,
    content: 'What is a thread?',
    status: 'Draft',
  });

  await assert.rejects(
    () =>
      service.createQuestion({
        topicId: 1,
        content: '  WHAT IS A THREAD?  ',
        status: 'Active',
      }),
    (error) => {
      assert.equal(error.statusCode, 409);
      assert.match(error.message, /already exists/i);
      return true;
    },
  );
});

test('returns not found for missing question', async () => {
  const service = createService();

  await assert.rejects(() => service.getQuestionById(999), (error) => {
    assert.equal(error.statusCode, 404);
    return true;
  });
});

test('validates required fields on create', async () => {
  const service = createService();

  await assert.rejects(
    () => service.createQuestion({ topicId: 1, status: 'Active' }),
    (error) => {
      assert.equal(error.statusCode, 400);
      return true;
    },
  );
});

test('rejects invalid foreign key references', async () => {
  const service = createService();

  await assert.rejects(
    () =>
      service.createQuestion({
        topicId: 404,
        content: 'Unknown topic question',
        status: 'Draft',
      }),
    (error) => {
      assert.equal(error.statusCode, 400);
      assert.match(error.message, /foreign key/i);
      return true;
    },
  );
});

test('updates and deletes a question', async () => {
  const service = createService();

  const created = await service.createQuestion({
    topicId: 1,
    content: 'Initial question',
    status: 'Draft',
  });

  const updated = await service.updateQuestion(created.id, {
    content: 'Updated question',
    status: 'Active',
  });

  assert.equal(updated.content, 'Updated question');
  assert.equal(updated.status, 'Active');

  const deleted = await service.deleteQuestion(created.id);
  assert.equal(deleted.id, created.id);

  await assert.rejects(() => service.getQuestionById(created.id), (error) => {
    assert.equal(error.statusCode, 404);
    return true;
  });
});
