/**
 * AIVES - Critical CRUD E2E tests (Jest + Supertest)
 *
 * Kiểm chứng đầy đủ vòng đời Create -> Read -> Update -> Delete cho 4 resource:
 *   Topic (/topics), Rubric (/rubrics), Question (/questions), Evaluation (/evaluations)
 * gồm happy path + các case critical:
 *   - validation (400), not found (404), invalid id (400)
 *   - ràng buộc nghiệp vụ / toàn vẹn dữ liệu (409: duplicate, đang được tham chiếu)
 *   - bảo mật: không cho ghi đè khóa chính / cột ngoài whitelist qua PATCH
 *   - dữ liệu persist đúng vào file JSON test và DB gốc không bị đụng tới
 *
 * Các test trong file chạy TUẦN TỰ và chia sẻ state (ID) với nhau.
 */
const request = require('supertest');
const { createTestContext } = require('./helpers/createTestContext');

const VALID_CRITERIA = [
  { name: 'Accuracy', weightPercent: 60, description: 'Correctness of the answer' },
  { name: 'Clarity', weightPercent: 40 },
];

describe('AIVES - Critical CRUD E2E', () => {
  let t;
  let app;

  const ids = {
    topic: null,        // topic sẽ được question tham chiếu
    spareTopic: null,   // topic không bị tham chiếu -> xoá được
    rubric: null,       // rubric sẽ được question tham chiếu
    spareRubric: null,  // rubric không bị tham chiếu -> xoá được
    question: null,
    otherQuestion: null,
    evaluation: null,
  };

  const api = () => request(app);

  beforeAll(() => {
    t = createTestContext('aives-crud-');
    ({ app } = t);
  });

  afterAll(async () => {
    if (t) await t.cleanup();
  });

  // ===========================================================================
  // TOPIC
  // ===========================================================================
  describe('Topic CRUD', () => {
    test('C: POST /topics -> 201 với topic_id tự tăng', async () => {
      const res = await api().post('/topics').send({ name: '  OOP Fundamentals  ', course_id: 'SWD392' });

      expect(res.status).toBe(201);
      expect(res.body).toEqual({ topic_id: expect.any(Number), name: 'OOP Fundamentals', course_id: 'SWD392' });
      ids.topic = res.body.topic_id;

      const res2 = await api().post('/topics').send({ name: 'Design Patterns' });
      expect(res2.status).toBe(201);
      expect(res2.body.topic_id).toBe(ids.topic + 1);
      expect(res2.body.course_id).toBeNull();
      ids.spareTopic = res2.body.topic_id;
    });

    test.each([
      ['thiếu name', { course_id: 'SWD392' }],
      ['name rỗng', { name: '   ' }],
      ['name không phải string', { name: 123 }],
    ])('C: POST /topics %s -> 400', async (_label, body) => {
      const res = await api().post('/topics').send(body);
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/name is required/i);
    });

    test('C: POST /topics không có body -> 400 (không được crash 500)', async () => {
      const res = await api().post('/topics');
      expect(res.status).toBe(400);
    });

    test('R: GET /topics trả danh sách đã sắp xếp theo id', async () => {
      const res = await api().get('/topics');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.map((x) => x.topic_id)).toEqual([ids.topic, ids.spareTopic]);
    });

    test('R: GET /topics/:id -> 200', async () => {
      const res = await api().get(`/topics/${ids.topic}`);
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('OOP Fundamentals');
    });

    test('R: GET /topics/:id không tồn tại -> 404', async () => {
      const res = await api().get('/topics/9999');
      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Topic not found');
    });

    test.each(['abc', '0', '-1', '1.5'])('R: GET /topics/%s (id không hợp lệ) -> 400', async (badId) => {
      const res = await api().get(`/topics/${badId}`);
      expect(res.status).toBe(400);
    });

    test('U: PATCH /topics/:id cập nhật name & course_id -> 200', async () => {
      const res = await api()
        .patch(`/topics/${ids.topic}`)
        .send({ name: 'OOP Fundamentals (Java)', course_id: 'PRO192' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ topic_id: ids.topic, name: 'OOP Fundamentals (Java)', course_id: 'PRO192' });

      const check = await api().get(`/topics/${ids.topic}`);
      expect(check.body.name).toBe('OOP Fundamentals (Java)');
    });

    test('U [critical]: PATCH không được ghi đè topic_id (khoá chính)', async () => {
      const res = await api().patch(`/topics/${ids.topic}`).send({ name: 'OOP', topic_id: 777 });
      expect(res.status).toBe(200);
      expect(res.body.topic_id).toBe(ids.topic);
      expect((await api().get('/topics/777')).status).toBe(404);
    });

    test('U [critical]: PATCH với key lạ / SQL injection trong tên cột bị từ chối', async () => {
      const res = await api()
        .patch(`/topics/${ids.topic}`)
        .send({ 'name = name; DROP TABLE topic; --': 'x' });
      expect(res.status).toBe(400);

      const check = await api().get(`/topics/${ids.topic}`);
      expect(check.status).toBe(200);
      expect(check.body.name).toBe('OOP');
    });

    test('U: PATCH name rỗng -> 400, body rỗng -> 400, id không tồn tại -> 404', async () => {
      expect((await api().patch(`/topics/${ids.topic}`).send({ name: '' })).status).toBe(400);
      expect((await api().patch(`/topics/${ids.topic}`).send({})).status).toBe(400);
      expect((await api().patch('/topics/9999').send({ name: 'x' })).status).toBe(404);
    });
  });

  // ===========================================================================
  // RUBRIC
  // ===========================================================================
  describe('Rubric CRUD', () => {
    test('C: POST /rubrics -> 201 kèm criteria', async () => {
      const res = await api().post('/rubrics').send({ maxScore: 10, criteria: VALID_CRITERIA });

      expect(res.status).toBe(201);
      expect(res.body).toEqual({
        id: expect.any(Number),
        maxScore: 10,
        criteria: [
          { id: expect.any(Number), name: 'Accuracy', weightPercent: 60, description: 'Correctness of the answer' },
          { id: expect.any(Number), name: 'Clarity', weightPercent: 40, description: null },
        ],
      });
      ids.rubric = res.body.id;

      const spare = await api().post('/rubrics').send({ maxScore: 5, criteria: [{ name: 'Overall', weightPercent: 100 }] });
      expect(spare.status).toBe(201);
      ids.spareRubric = spare.body.id;
    });

    test.each([
      ['tổng weight != 100', 400, { maxScore: 10, criteria: [{ name: 'A', weightPercent: 50 }, { name: 'B', weightPercent: 40 }] }],
      ['maxScore <= 0', 400, { maxScore: 0, criteria: [{ name: 'A', weightPercent: 100 }] }],
      ['criteria rỗng', 400, { maxScore: 10, criteria: [] }],
      ['weight > 100', 400, { maxScore: 10, criteria: [{ name: 'A', weightPercent: 150 }] }],
      ['criterion thiếu name', 400, { maxScore: 10, criteria: [{ weightPercent: 100 }] }],
      ['trùng tên criterion (case-insensitive)', 409, { maxScore: 10, criteria: [{ name: 'Logic', weightPercent: 50 }, { name: ' logic ', weightPercent: 50 }] }],
    ])('C: POST /rubrics %s -> %i', async (_label, expected, body) => {
      const before = (await api().get('/rubrics')).body.length;
      const res = await api().post('/rubrics').send(body);
      expect(res.status).toBe(expected);
      // Không được tạo rubric "mồ côi" khi validate fail
      expect((await api().get('/rubrics')).body.length).toBe(before);
    });

    test('R: GET /rubrics và GET /rubrics/:id', async () => {
      const list = await api().get('/rubrics');
      expect(list.status).toBe(200);
      expect(list.body.map((r) => r.id)).toEqual([ids.rubric, ids.spareRubric]);

      const one = await api().get(`/rubrics/${ids.rubric}`);
      expect(one.status).toBe(200);
      expect(one.body.criteria).toHaveLength(2);
    });

    test('R: GET /rubrics/:id không tồn tại -> 404, id sai -> 400', async () => {
      expect((await api().get('/rubrics/9999')).status).toBe(404);
      expect((await api().get('/rubrics/abc')).status).toBe(400);
    });

    test('U: PUT /rubrics/:id thay maxScore và toàn bộ criteria -> 200', async () => {
      const res = await api()
        .put(`/rubrics/${ids.rubric}`)
        .send({
          maxScore: 20,
          criteria: [
            { name: 'Accuracy', weightPercent: 50 },
            { name: 'Clarity', weightPercent: 30 },
            { name: 'Depth', weightPercent: 20 },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.maxScore).toBe(20);
      expect(res.body.criteria.map((c) => c.name)).toEqual(['Accuracy', 'Clarity', 'Depth']);
      expect(res.body.criteria.reduce((s, c) => s + c.weightPercent, 0)).toBe(100);

      // Criteria cũ phải bị xoá, không còn sót trong DB
      const persisted = await t.db.readPersisted();
      expect(persisted.rubricCriteria.filter(([, c]) => c.rubric_id === ids.rubric)).toHaveLength(3);
    });

    test('U: PUT chỉ maxScore giữ nguyên criteria', async () => {
      const res = await api().put(`/rubrics/${ids.rubric}`).send({ maxScore: 10 });
      expect(res.status).toBe(200);
      expect(res.body.maxScore).toBe(10);
      expect(res.body.criteria).toHaveLength(3);
    });

    test('U: PUT lỗi -> 400 (weight sai / criterion id của rubric khác / body rỗng), 404 khi không tồn tại', async () => {
      expect((await api().put(`/rubrics/${ids.rubric}`).send({ criteria: [{ name: 'A', weightPercent: 10 }] })).status).toBe(400);

      const spare = await api().get(`/rubrics/${ids.spareRubric}`);
      const foreignCriterionId = spare.body.criteria[0].id;
      const res = await api()
        .put(`/rubrics/${ids.rubric}`)
        .send({ criteria: [{ id: foreignCriterionId, name: 'Hijack', weightPercent: 100 }] });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/criterion reference/i);

      expect((await api().put(`/rubrics/${ids.rubric}`).send({})).status).toBe(400);
      expect((await api().put('/rubrics/9999').send({ maxScore: 5 })).status).toBe(404);
    });
  });

  // ===========================================================================
  // QUESTION
  // ===========================================================================
  describe('Question CRUD', () => {
    test('C: POST /questions -> 201 gắn topic & rubric', async () => {
      const res = await api().post('/questions').send({
        topicId: ids.topic,
        rubricId: ids.rubric,
        content: 'What is polymorphism?',
        status: 'Active',
      });

      expect(res.status).toBe(201);
      expect(res.body).toEqual({
        id: expect.any(Number),
        topicId: ids.topic,
        rubricId: ids.rubric,
        content: 'What is polymorphism?',
        status: 'Active',
      });
      ids.question = res.body.id;

      const other = await api().post('/questions').send({
        topicId: ids.topic,
        content: 'What is encapsulation?',
        status: 'Draft',
      });
      expect(other.status).toBe(201);
      expect(other.body.rubricId).toBeNull();
      ids.otherQuestion = other.body.id;
    });

    test.each([
      ['trùng nội dung (case/space-insensitive)', 409, () => ({ topicId: ids.topic, content: '  WHAT IS POLYMORPHISM?  ', status: 'Active' })],
      ['status không hợp lệ', 400, () => ({ topicId: ids.topic, content: 'Q status', status: 'Published' })],
      ['thiếu content', 400, () => ({ topicId: ids.topic, status: 'Active' })],
      ['topicId không phải số nguyên dương', 400, () => ({ topicId: 'abc', content: 'Q x', status: 'Active' })],
      ['topic không tồn tại (FK)', 400, () => ({ topicId: 9999, content: 'Q fk topic', status: 'Active' })],
      ['rubric không tồn tại (FK)', 400, () => ({ topicId: ids.topic, rubricId: 9999, content: 'Q fk rubric', status: 'Active' })],
    ])('C: POST /questions %s -> %i', async (_label, expected, makeBody) => {
      const before = (await api().get('/questions')).body.length;
      const res = await api().post('/questions').send(makeBody());
      expect(res.status).toBe(expected);
      expect((await api().get('/questions')).body.length).toBe(before);
    });

    test('R: GET /questions, GET /questions/:id, 404, id sai 400', async () => {
      const list = await api().get('/questions');
      expect(list.status).toBe(200);
      expect(list.body.map((q) => q.id)).toEqual([ids.question, ids.otherQuestion]);

      const one = await api().get(`/questions/${ids.question}`);
      expect(one.status).toBe(200);
      expect(one.body.content).toBe('What is polymorphism?');

      expect((await api().get('/questions/9999')).status).toBe(404);
      expect((await api().get('/questions/xyz')).status).toBe(400);
    });

    test('U: PUT /questions/:id cập nhật content/status/rubric -> 200', async () => {
      const res = await api()
        .put(`/questions/${ids.otherQuestion}`)
        .send({ content: 'Explain encapsulation with an example.', status: 'Active', rubricId: ids.rubric });

      expect(res.status).toBe(200);
      expect(res.body).toEqual(
        expect.objectContaining({
          id: ids.otherQuestion,
          content: 'Explain encapsulation with an example.',
          status: 'Active',
          rubricId: ids.rubric,
        }),
      );
    });

    test('U: PUT giữ nguyên content của chính nó không bị coi là duplicate', async () => {
      const res = await api().put(`/questions/${ids.question}`).send({ content: 'What is polymorphism?' });
      expect(res.status).toBe(200);
    });

    test('U: PUT rubricId=null để gỡ rubric khỏi câu hỏi', async () => {
      const res = await api().put(`/questions/${ids.otherQuestion}`).send({ rubricId: null });
      expect(res.status).toBe(200);
      expect(res.body.rubricId).toBeNull();
    });

    test('U: PUT lỗi -> 409 trùng câu khác, 400 body rỗng/status sai/FK sai, 404 không tồn tại', async () => {
      expect((await api().put(`/questions/${ids.otherQuestion}`).send({ content: 'what is POLYMORPHISM?' })).status).toBe(409);
      expect((await api().put(`/questions/${ids.question}`).send({})).status).toBe(400);
      expect((await api().put(`/questions/${ids.question}`).send({ status: 'Archived' })).status).toBe(400);
      expect((await api().put(`/questions/${ids.question}`).send({ topicId: 9999 })).status).toBe(400);
      expect((await api().put('/questions/9999').send({ status: 'Draft' })).status).toBe(404);
    });
  });

  // ===========================================================================
  // EVALUATION
  // ===========================================================================
  describe('Evaluation CRUD', () => {
    test('C: POST /evaluations -> 201, mặc định status PENDING', async () => {
      const res = await api().post('/evaluations').send({
        session_id: 'sess-001',
        student_id: 'SE150001',
        question_id: ids.question,
        ai_suggested_score: 7.5,
        ai_feedback: 'Decent answer',
      });

      expect(res.status).toBe(201);
      expect(res.body).toEqual({
        evaluation_id: expect.any(Number),
        session_id: 'sess-001',
        student_id: 'SE150001',
        question_id: ids.question,
        ai_suggested_score: 7.5,
        ai_feedback: 'Decent answer',
        final_score: null,
        lecturer_feedback: null,
        status: 'PENDING',
      });
      ids.evaluation = res.body.evaluation_id;
    });

    test.each([
      ['thiếu session_id', { student_id: 'SE1' }],
      ['thiếu student_id', { session_id: 's' }],
      ['status không hợp lệ', { session_id: 's', student_id: 'SE1', status: 'DONE' }],
      ['điểm âm', { session_id: 's', student_id: 'SE1', ai_suggested_score: -1 }],
      ['điểm không phải số', { session_id: 's', student_id: 'SE1', ai_suggested_score: 'ten' }],
      ['question_id không hợp lệ', { session_id: 's', student_id: 'SE1', question_id: 'q1' }],
    ])('C: POST /evaluations %s -> 400', async (_label, body) => {
      const res = await api().post('/evaluations').send(body);
      expect(res.status).toBe(400);
    });

    test('C: POST /evaluations không có body -> 400 (không crash 500)', async () => {
      expect((await api().post('/evaluations')).status).toBe(400);
    });

    test('R: GET /evaluations, GET /evaluations/:id, 404, id sai 400', async () => {
      const list = await api().get('/evaluations');
      expect(list.status).toBe(200);
      expect(list.body).toHaveLength(1);

      const one = await api().get(`/evaluations/${ids.evaluation}`);
      expect(one.status).toBe(200);
      expect(one.body.status).toBe('PENDING');

      expect((await api().get('/evaluations/9999')).status).toBe(404);
      expect((await api().get('/evaluations/abc')).status).toBe(400);
    });

    test('U [critical]: không được APPROVE khi chưa có final_score', async () => {
      const res = await api().patch(`/evaluations/${ids.evaluation}`).send({ status: 'APPROVED' });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/final_score/);
      expect((await api().get(`/evaluations/${ids.evaluation}`)).body.status).toBe('PENDING');
    });

    test('U: PATCH chốt điểm + APPROVED (status không phân biệt hoa thường) -> 200', async () => {
      const res = await api()
        .patch(`/evaluations/${ids.evaluation}`)
        .send({ final_score: 8, lecturer_feedback: 'Good, needs more examples', status: 'approved' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual(
        expect.objectContaining({
          evaluation_id: ids.evaluation,
          ai_suggested_score: 7.5,
          final_score: 8,
          lecturer_feedback: 'Good, needs more examples',
          status: 'APPROVED',
        }),
      );
    });

    test('U [critical]: PATCH không được đổi evaluation_id / session_id / student_id', async () => {
      const res = await api()
        .patch(`/evaluations/${ids.evaluation}`)
        .send({ evaluation_id: 555, session_id: 'hijacked', student_id: 'SE999', lecturer_feedback: 'ok' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual(
        expect.objectContaining({
          evaluation_id: ids.evaluation,
          session_id: 'sess-001',
          student_id: 'SE150001',
          lecturer_feedback: 'ok',
        }),
      );
      expect((await api().get('/evaluations/555')).status).toBe(404);
    });

    test('U: PATCH lỗi -> 400 (chỉ field bất biến / status sai / điểm âm), 404 không tồn tại', async () => {
      expect((await api().patch(`/evaluations/${ids.evaluation}`).send({ session_id: 'x' })).status).toBe(400);
      expect((await api().patch(`/evaluations/${ids.evaluation}`).send({ status: 'DONE' })).status).toBe(400);
      expect((await api().patch(`/evaluations/${ids.evaluation}`).send({ final_score: -3 })).status).toBe(400);
      expect((await api().patch('/evaluations/9999').send({ final_score: 5 })).status).toBe(404);
    });

    test('U: PATCH chuyển sang REJECTED -> 200', async () => {
      const res = await api().patch(`/evaluations/${ids.evaluation}`).send({ status: 'REJECTED' });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('REJECTED');
    });

    test('D: DELETE /evaluations/:id -> 204, sau đó GET 404, xoá lần 2 -> 404', async () => {
      expect((await api().delete(`/evaluations/${ids.evaluation}`)).status).toBe(204);
      expect((await api().get(`/evaluations/${ids.evaluation}`)).status).toBe(404);
      expect((await api().delete(`/evaluations/${ids.evaluation}`)).status).toBe(404);
      expect((await api().get('/evaluations')).body).toHaveLength(0);
    });
  });

  // ===========================================================================
  // DELETE + toàn vẹn tham chiếu
  // ===========================================================================
  describe('Delete & referential integrity', () => {
    test('D [critical]: không xoá được Topic đang có Question -> 409', async () => {
      const res = await api().delete(`/topics/${ids.topic}`);
      expect(res.status).toBe(409);
      expect((await api().get(`/topics/${ids.topic}`)).status).toBe(200);
    });

    test('D [critical]: không xoá được Rubric đang gán cho Question -> 409', async () => {
      const res = await api().delete(`/rubrics/${ids.rubric}`);
      expect(res.status).toBe(409);
      expect(res.body.message).toMatch(/assigned to questions/i);
      expect((await api().get(`/rubrics/${ids.rubric}`)).status).toBe(200);
    });

    test('D: xoá Topic / Rubric không bị tham chiếu -> thành công, rồi 404', async () => {
      expect((await api().delete(`/topics/${ids.spareTopic}`)).status).toBe(204);
      expect((await api().get(`/topics/${ids.spareTopic}`)).status).toBe(404);

      const delRubric = await api().delete(`/rubrics/${ids.spareRubric}`);
      expect(delRubric.status).toBe(200);
      expect(delRubric.body.id).toBe(ids.spareRubric);
      expect((await api().get(`/rubrics/${ids.spareRubric}`)).status).toBe(404);

      // Criteria của rubric bị xoá phải bị cascade
      const persisted = await t.db.readPersisted();
      expect(persisted.rubricCriteria.filter(([, c]) => c.rubric_id === ids.spareRubric)).toHaveLength(0);
    });

    test('D: DELETE /questions/:id -> 200 trả bản ghi đã xoá, sau đó 404', async () => {
      const res = await api().delete(`/questions/${ids.question}`);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(ids.question);
      expect((await api().get(`/questions/${ids.question}`)).status).toBe(404);
      expect((await api().delete(`/questions/${ids.question}`)).status).toBe(404);

      expect((await api().delete(`/questions/${ids.otherQuestion}`)).status).toBe(200);
      expect((await api().get('/questions')).body).toHaveLength(0);
    });

    test('D: sau khi gỡ hết Question, Rubric và Topic đã xoá được', async () => {
      expect((await api().delete(`/rubrics/${ids.rubric}`)).status).toBe(200);
      expect((await api().delete(`/topics/${ids.topic}`)).status).toBe(204);

      expect((await api().get('/topics')).body).toEqual([]);
      expect((await api().get('/rubrics')).body).toEqual([]);
    });

    test('D: xoá với id không hợp lệ -> 400, không tồn tại -> 404', async () => {
      expect((await api().delete('/topics/abc')).status).toBe(400);
      expect((await api().delete('/topics/9999')).status).toBe(404);
      expect((await api().delete('/rubrics/9999')).status).toBe(404);
      expect((await api().delete('/evaluations/abc')).status).toBe(400);
    });
  });

  // ===========================================================================
  // Persistence & isolation
  // ===========================================================================
  describe('Persistence & isolation', () => {
    test('File JSON test phản ánh đúng trạng thái cuối (rỗng) và ID counter không bị reset', async () => {
      const data = await t.db.readPersisted();
      expect(data.topics).toEqual([]);
      expect(data.rubrics).toEqual([]);
      expect(data.rubricCriteria).toEqual([]);
      expect(data.questions).toEqual([]);
      expect(data.evaluations).toEqual([]);
      // ID không được tái sử dụng sau khi xoá
      expect(data.nextTopicId).toBeGreaterThan(ids.spareTopic);
      expect(data.nextQuestionId).toBeGreaterThan(ids.otherQuestion);
      expect(data.nextEvaluationId).toBeGreaterThan(ids.evaluation);
    });

    test('Tạo mới sau khi xoá không tái sử dụng ID cũ', async () => {
      const res = await api().post('/topics').send({ name: 'Fresh topic' });
      expect(res.status).toBe(201);
      expect(res.body.topic_id).toBeGreaterThan(ids.spareTopic);
    });

    test('File mock-database.json gốc không bị thay đổi', () => {
      expect(t.originalDbUnchanged()).toBe(true);
    });
  });
});
