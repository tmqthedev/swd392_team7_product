const test = require('node:test');
const assert = require('node:assert/strict');
const { InMemoryDatabase } = require('../src/db/createDatabase');
const { RubricRepository } = require('../src/repositories/rubricRepository');
const { RubricService } = require('../src/services/rubricService');
const { QuestionRepository } = require('../src/repositories/questionRepository');
const { QuestionService } = require('../src/services/questionService');

function createRubricService(db = new InMemoryDatabase({ persist: false })) {
  return {
    db,
    rubricService: new RubricService({ repository: new RubricRepository(db) }),
    questionService: new QuestionService({ repository: new QuestionRepository(db) }),
  };
}

function sampleRubricPayload(overrides = {}) {
  return {
    maxScore: 10,
    criteria: [
      { name: 'Accuracy', weightPercent: 50 },
      { name: 'Clarity', weightPercent: 50 },
    ],
    ...overrides,
  };
}

test('creates and lists rubrics with criteria', async () => {
  const { rubricService } = createRubricService();

  const created = await rubricService.createRubric(sampleRubricPayload());
  assert.equal(created.id, 1);
  assert.equal(created.maxScore, 10);
  assert.equal(created.criteria.length, 2);

  const list = await rubricService.listRubrics();
  assert.equal(list.length, 1);
  assert.equal(list[0].criteria[0].name, 'Accuracy');
});

test('rejects rubric when criteria weights do not total 100', async () => {
  const { rubricService } = createRubricService();

  await assert.rejects(
    () =>
      rubricService.createRubric(
        sampleRubricPayload({
          criteria: [
            { name: 'Accuracy', weightPercent: 40 },
            { name: 'Clarity', weightPercent: 40 },
          ],
        }),
      ),
    (error) => {
      assert.equal(error.statusCode, 400);
      return true;
    },
  );
});

test('rejects duplicate criterion names in the same rubric', async () => {
  const { rubricService } = createRubricService();

  await assert.rejects(
    () =>
      rubricService.createRubric(
        sampleRubricPayload({
          criteria: [
            { name: 'Accuracy', weightPercent: 50 },
            { name: ' accuracy ', weightPercent: 50 },
          ],
        }),
      ),
    (error) => {
      assert.equal(error.statusCode, 409);
      return true;
    },
  );
});

test('updates rubric and replaces criteria', async () => {
  const { rubricService } = createRubricService();
  const created = await rubricService.createRubric(sampleRubricPayload());

  const updated = await rubricService.updateRubric(created.id, {
    maxScore: 20,
    criteria: [{ name: 'Depth', weightPercent: 100 }],
  });

  assert.equal(updated.maxScore, 20);
  assert.equal(updated.criteria.length, 1);
  assert.equal(updated.criteria[0].name, 'Depth');
});

test('rejects invalid criterion reference on update', async () => {
  const { rubricService } = createRubricService();
  const created = await rubricService.createRubric(sampleRubricPayload());

  await assert.rejects(
    () =>
      rubricService.updateRubric(created.id, {
        criteria: [{ id: 999, name: 'Depth', weightPercent: 100 }],
      }),
    (error) => {
      assert.equal(error.statusCode, 400);
      assert.match(error.message, /criterion reference/i);
      return true;
    },
  );
});

test('blocks delete when rubric is assigned to a question', async () => {
  const { db, rubricService, questionService } = createRubricService();
  const rubric = await rubricService.createRubric(sampleRubricPayload());

  await questionService.createQuestion({
    topicId: 1,
    rubricId: rubric.id,
    content: 'Question linked to rubric',
    status: 'Active',
  });

  await assert.rejects(() => rubricService.deleteRubric(rubric.id), (error) => {
    assert.equal(error.statusCode, 409);
    return true;
  });

  assert.equal(db.rubrics.has(rubric.id), true);
});

test('deletes rubric when not in use', async () => {
  const { rubricService } = createRubricService();
  const created = await rubricService.createRubric(sampleRubricPayload());
  const deleted = await rubricService.deleteRubric(created.id);

  assert.equal(deleted.id, created.id);
  await assert.rejects(() => rubricService.getRubricById(created.id), (error) => {
    assert.equal(error.statusCode, 404);
    return true;
  });
});
