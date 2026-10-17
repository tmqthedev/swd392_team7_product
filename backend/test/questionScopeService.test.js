const test = require('node:test');
const assert = require('node:assert/strict');
const { QuestionService } = require('../src/services/questionService');
const { SubjectScope } = require('../src/services/subjectScope');

const IN_SCOPE_SUBJECT = 42;
const OUT_OF_SCOPE_SUBJECT = 99;

// Fake question repo seeded with two questions: one on an in-scope subject's
// topic and one on an out-of-scope subject's topic.
class FakeQuestionRepo {
  constructor() {
    this.rows = new Map([
      [1, {
        question_id: 1, topic_id: 10, status: 'PENDING_REVIEW', rubric_id: 5, content: 'in-scope',
      }],
      [2, {
        question_id: 2, topic_id: 20, status: 'PENDING_REVIEW', rubric_id: 6, content: 'out-of-scope',
      }],
    ]);
  }

  async findAllFiltered() {
    return [...this.rows.values()].map((r) => ({ ...r }));
  }

  async findById(id) {
    const row = this.rows.get(Number(id));
    return row ? { ...row } : null;
  }

  async findByNormalizedContent() { return null; }

  async create(payload) {
    const id = this.rows.size + 1;
    const row = { question_id: id, topic_id: payload.topicId, ...payload };
    this.rows.set(id, row);
    return { ...row };
  }

  async updateStatusFields(id, fields) {
    const row = this.rows.get(Number(id));
    if (!row) return null;
    Object.assign(row, { status: fields.status });
    return { ...row };
  }
}

// topic 10 -> in-scope subject, topic 20 -> out-of-scope subject.
const topicRepository = {
  async getById(id) {
    const map = { 10: IN_SCOPE_SUBJECT, 20: OUT_OF_SCOPE_SUBJECT };
    const subjectId = map[Number(id)];
    return subjectId ? { topic_id: Number(id), subject_id: subjectId } : null;
  },
};

const subjectRepository = {
  async listSubjectIdsForLecturer() { return [IN_SCOPE_SUBJECT]; },
};

const stubEmbedding = { async embed() { return [1, 0, 0]; } };

function createService() {
  return new QuestionService({
    repository: new FakeQuestionRepo(),
    embeddingAdapter: stubEmbedding,
    topicRepository,
    subjectScope: new SubjectScope({ subjectRepository }),
  });
}

const LECTURER = { id: 7, role: 'LECTURER' };
const ADMIN = { id: 1, role: 'ADMIN' };

test('listQuestions filters out questions outside the lecturer scope', async () => {
  const service = createService();
  const rows = await service.listQuestions({}, LECTURER);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, 1);
});

test('listQuestions returns all questions for ADMIN', async () => {
  const service = createService();
  const rows = await service.listQuestions({}, ADMIN);
  assert.equal(rows.length, 2);
});

test('getQuestionById allows an in-scope question for a LECTURER', async () => {
  const service = createService();
  const row = await service.getQuestionById(1, LECTURER);
  assert.equal(row.id, 1);
});

test('approve denies an out-of-scope question with 403 FORBIDDEN', async () => {
  const service = createService();
  await assert.rejects(
    () => service.approve(2, { reviewedBy: 7, user: LECTURER }),
    (error) => {
      assert.equal(error.statusCode, 403);
      assert.equal(error.code, 'FORBIDDEN');
      return true;
    },
  );
});

test('approve allows an out-of-scope question for ADMIN', async () => {
  const service = createService();
  const row = await service.approve(2, { reviewedBy: 1, user: ADMIN });
  assert.equal(row.status, 'APPROVED');
});

test('updateQuestion denies an out-of-scope question for a LECTURER', async () => {
  const service = createService();
  await assert.rejects(
    () => service.updateQuestion(2, { content: 'changed' }, LECTURER),
    (error) => {
      assert.equal(error.statusCode, 403);
      assert.equal(error.code, 'FORBIDDEN');
      return true;
    },
  );
});
