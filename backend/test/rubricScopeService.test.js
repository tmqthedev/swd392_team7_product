const test = require('node:test');
const assert = require('node:assert/strict');
const { RubricService } = require('../src/services/rubricService');
const { SubjectScope } = require('../src/services/subjectScope');

const IN_SCOPE_SUBJECT = 42;
const OUT_OF_SCOPE_SUBJECT = 99;

// Fake rubric repo with two rubrics: one in an in-scope subject, one out of
// scope. Only the methods the scope paths touch are implemented.
class FakeRubricRepo {
  constructor() {
    this.rows = new Map([
      [1, {
        rubric_id: 1, subject_id: IN_SCOPE_SUBJECT, max_score: 10, is_locked: false, criteria: [],
      }],
      [2, {
        rubric_id: 2, subject_id: OUT_OF_SCOPE_SUBJECT, max_score: 10, is_locked: false, criteria: [],
      }],
    ]);
  }

  async findAll() {
    return [...this.rows.values()].map((r) => ({ ...r }));
  }

  async findById(id) {
    const row = this.rows.get(Number(id));
    return row ? { ...row } : null;
  }

  async countQuestionsUsingRubric() { return 0; }

  async deleteById(id) {
    const row = this.rows.get(Number(id));
    this.rows.delete(Number(id));
    return { ...row };
  }
}

const subjectRepository = {
  async listSubjectIdsForLecturer() { return [IN_SCOPE_SUBJECT]; },
};

function createService() {
  return new RubricService({
    repository: new FakeRubricRepo(),
    subjectScope: new SubjectScope({ subjectRepository }),
  });
}

const LECTURER = { id: 7, role: 'LECTURER' };
const ADMIN = { id: 1, role: 'ADMIN' };

test('listRubrics filters out rubrics outside the lecturer scope', async () => {
  const service = createService();
  const rows = await service.listRubrics(LECTURER);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, 1);
});

test('listRubrics returns all rubrics for ADMIN', async () => {
  const service = createService();
  const rows = await service.listRubrics(ADMIN);
  assert.equal(rows.length, 2);
});

test('getRubricById allows an in-scope rubric for a LECTURER', async () => {
  const service = createService();
  const rubric = await service.getRubricById(1, LECTURER);
  assert.equal(rubric.id, 1);
});

test('deleteRubric denies an out-of-scope rubric with 403 FORBIDDEN', async () => {
  const service = createService();
  await assert.rejects(
    () => service.deleteRubric(2, LECTURER),
    (error) => {
      assert.equal(error.statusCode, 403);
      assert.equal(error.code, 'FORBIDDEN');
      return true;
    },
  );
});

test('deleteRubric allows an out-of-scope rubric for ADMIN', async () => {
  const service = createService();
  const rubric = await service.deleteRubric(2, ADMIN);
  assert.equal(rubric.id, 2);
});

test('updateRubric denies an out-of-scope rubric for a LECTURER', async () => {
  const service = createService();
  await assert.rejects(
    () => service.updateRubric(2, { maxScore: 20 }, LECTURER),
    (error) => {
      assert.equal(error.statusCode, 403);
      assert.equal(error.code, 'FORBIDDEN');
      return true;
    },
  );
});

test('rubric name is optional, trimmed, cleared by an empty string and length-checked', () => {
  const service = new RubricService({ repository: {} });
  const errors = [];
  assert.equal(service._parseOptionalName(undefined, errors), undefined);
  assert.equal(service._parseOptionalName('  Midterm rubric ', errors), 'Midterm rubric');
  assert.equal(service._parseOptionalName('   ', errors), null);
  assert.equal(errors.length, 0);
  service._parseOptionalName('x'.repeat(256), errors);
  service._parseOptionalName(5, errors);
  assert.equal(errors.length, 2);
});
