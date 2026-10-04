/**
 * AIVES - End-to-End workflow tests (Jest + Supertest)
 *
 * Luồng 1: Giảng viên chuẩn bị bộ đề      (Topic -> Rubric -> Question)
 * Luồng 2: Sinh viên thi vấn đáp với AI    (Upload session -> Process webhook)
 * Luồng 3: Giảng viên duyệt kết quả       (Evaluation PENDING -> APPROVED)
 *
 * Cô lập dữ liệu:
 *  - DB giả lập ghi vào một file JSON trong thư mục tạm (os.tmpdir), KHÔNG đọc/ghi
 *    backend/mock-database.json gốc. File tạm bị xóa sau khi chạy xong.
 *  - Session store (mock DynamoDB) là in-memory, sống theo vòng đời test.
 *  - Có bước kiểm chứng hash của mock-database.json gốc không bị thay đổi.
 */

const fs = require('fs');
const request = require('supertest');
const { createTestContext } = require('./helpers/createTestContext');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe('AIVES System - E2E Workflows', () => {
  let t;
  let app;
  let db;
  let testEnv;
  let testDbPath;

  // Shared state giữa các bước (các bước phụ thuộc ID của nhau)
  const ctx = {
    topicId: null,
    rubricId: null,
    questionId: null,
    sessionId: null,
    objectKey: null,
    aiScore: null,
    evaluationId: null,
  };

  beforeAll(() => {
    t = createTestContext('aives-workflow-');
    ({ app, db, testEnv, testDbPath } = t);
  });

  afterAll(async () => {
    if (t) await t.cleanup();
  });

  // ---------------------------------------------------------------------------
  // Luồng 1: Giảng viên chuẩn bị bộ đề
  // ---------------------------------------------------------------------------
  describe('Luồng 1: Giảng viên chuẩn bị bộ đề (Question & Rubric Creation)', () => {
    test('B1: POST /topics tạo Topic mới -> 201', async () => {
      const res = await request(app)
        .post('/topics')
        .send({ name: 'Node.js Event Loop', course_id: 'SWD392' })
        .expect('Content-Type', /json/);

      expect(res.status).toBe(201);
      expect(res.body).toEqual(
        expect.objectContaining({ name: 'Node.js Event Loop', course_id: 'SWD392' }),
      );
      expect(typeof res.body.topic_id).toBe('number');
      expect(Number.isInteger(res.body.topic_id)).toBe(true);
      expect(res.body.topic_id).toBeGreaterThan(0);

      ctx.topicId = res.body.topic_id;
    });

    test('B2: POST /rubrics tạo Rubric với criteria tổng weight = 100 -> 201', async () => {
      const criteria = [
        { name: 'Technical Accuracy', weightPercent: 50, description: 'Đúng bản chất kỹ thuật' },
        { name: 'Depth of Understanding', weightPercent: 30, description: 'Giải thích sâu, có ví dụ' },
        { name: 'Communication', weightPercent: 20, description: 'Trình bày mạch lạc' },
      ];

      const res = await request(app)
        .post('/rubrics')
        .send({ maxScore: 10, criteria })
        .expect('Content-Type', /json/);

      expect(res.status).toBe(201);
      expect(typeof res.body.id).toBe('number');
      expect(res.body.id).toBeGreaterThan(0);
      expect(res.body.maxScore).toBe(10);

      expect(Array.isArray(res.body.criteria)).toBe(true);
      expect(res.body.criteria).toHaveLength(criteria.length);
      res.body.criteria.forEach((c) => {
        expect(typeof c.id).toBe('number');
        expect(typeof c.name).toBe('string');
        expect(typeof c.weightPercent).toBe('number');
      });
      const totalWeight = res.body.criteria.reduce((sum, c) => sum + c.weightPercent, 0);
      expect(totalWeight).toBe(100);

      ctx.rubricId = res.body.id;
    });

    test('B3: POST /questions tạo Question gán topic_id & rubric_id -> 201', async () => {
      expect(ctx.topicId).not.toBeNull();
      expect(ctx.rubricId).not.toBeNull();

      const res = await request(app)
        .post('/questions')
        .send({
          topicId: ctx.topicId,
          rubricId: ctx.rubricId,
          content: 'Explain how the Node.js Event Loop handles asynchronous I/O.',
          status: 'Active',
        })
        .expect('Content-Type', /json/);

      expect(res.status).toBe(201);
      expect(typeof res.body.id).toBe('number');
      expect(res.body.id).toBeGreaterThan(0);
      expect(res.body).toEqual(
        expect.objectContaining({
          topicId: ctx.topicId,
          rubricId: ctx.rubricId,
          status: 'Active',
          content: expect.any(String),
        }),
      );

      ctx.questionId = res.body.id;
    });
  });

  // ---------------------------------------------------------------------------
  // Luồng 2: Sinh viên thi vấn đáp với AI
  // ---------------------------------------------------------------------------
  describe('Luồng 2: Sinh viên thi phỏng vấn với AI (AI Viva Interview Session)', () => {
    test('B4: POST /api/audio/upload-url tạo Upload Session -> trả sessionId & uploadUrl', async () => {
      const res = await request(app)
        .post('/api/audio/upload-url')
        .send({ contentType: 'audio/webm', candidateId: 'SE150000' })
        .expect('Content-Type', /json/);

      expect(res.status).toBe(201);
      expect(typeof res.body.sessionId).toBe('string');
      expect(res.body.sessionId).toMatch(UUID_REGEX);
      expect(typeof res.body.uploadUrl).toBe('string');
      expect(res.body.uploadUrl).toContain(testEnv.audioBucket);
      expect(res.body.objectKey).toBe(`sessions/${res.body.sessionId}/input.webm`);
      expect(res.body.expiresInSeconds).toBe(300);

      ctx.sessionId = res.body.sessionId;
      ctx.objectKey = res.body.objectKey;

      // Session phải được ghi vào session store với trạng thái UPLOADED
      const statusRes = await request(app).get(`/api/audio/status/${ctx.sessionId}`);
      expect(statusRes.status).toBe(200);
      expect(statusRes.body.status).toBe('UPLOADED');
    });

    test('B5: POST /api/audio/process (webhook mock Transcribe + Bedrock) -> xử lý thành công', async () => {
      expect(ctx.sessionId).not.toBeNull();

      const res = await request(app)
        .post('/api/audio/process')
        .send({ sessionId: ctx.sessionId, objectKey: ctx.objectKey })
        .expect('Content-Type', /json/);

      // Webhook trả 202 Accepted (xử lý bất đồng bộ)
      expect(res.status).toBe(202);
      expect(res.body).toEqual({ sessionId: ctx.sessionId, status: 'PROCESSING' });

      // Mock mode: AI hoàn tất ngay -> kiểm chứng transcript + điểm AI
      const resultRes = await request(app).get(`/api/audio/result/${ctx.sessionId}`);
      expect(resultRes.status).toBe(200);
      expect(resultRes.body.status).toBe('COMPLETED');
      expect(typeof resultRes.body.transcript).toBe('string');
      expect(resultRes.body.transcript.length).toBeGreaterThan(0);
      expect(typeof resultRes.body.aiEvaluation.score).toBe('number');
      expect(resultRes.body.aiEvaluation.score).toBeGreaterThan(0);
      expect(typeof resultRes.body.aiEvaluation.summary).toBe('string');

      ctx.aiScore = resultRes.body.aiEvaluation.score;
    });

    test('B5b (negative): process với sessionId không tồn tại -> 404', async () => {
      const res = await request(app)
        .post('/api/audio/process')
        .send({ sessionId: 'non-existent-session', objectKey: 'x' });

      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Session not found');
    });
  });

  // ---------------------------------------------------------------------------
  // Luồng 3: Giảng viên duyệt kết quả
  // ---------------------------------------------------------------------------
  describe('Luồng 3: Giảng viên duyệt kết quả (Lecturer Review & Approval)', () => {
    test('B6: POST /evaluations tạo bảng điểm nháp PENDING -> 201', async () => {
      expect(ctx.sessionId).not.toBeNull();
      expect(ctx.questionId).not.toBeNull();
      expect(ctx.aiScore).not.toBeNull();

      const res = await request(app)
        .post('/evaluations')
        .send({
          session_id: ctx.sessionId,
          student_id: 'SE150000',
          question_id: ctx.questionId,
          ai_suggested_score: ctx.aiScore,
          ai_feedback: 'Mock Bedrock evaluation from local adapter.',
          status: 'PENDING',
        })
        .expect('Content-Type', /json/);

      expect(res.status).toBe(201);
      expect(typeof res.body.evaluation_id).toBe('number');
      expect(res.body.evaluation_id).toBeGreaterThan(0);
      expect(res.body).toEqual(
        expect.objectContaining({
          session_id: ctx.sessionId,
          question_id: ctx.questionId,
          ai_suggested_score: ctx.aiScore,
          status: 'PENDING',
        }),
      );
      expect(res.body.final_score == null).toBe(true);

      ctx.evaluationId = res.body.evaluation_id;
    });

    test('B7: PATCH /evaluations/:id giảng viên chốt điểm -> 200 & APPROVED', async () => {
      expect(ctx.evaluationId).not.toBeNull();

      const patch = {
        final_score: 9,
        lecturer_feedback: 'Giải thích rõ ràng, có ví dụ thực tế về libuv.',
        status: 'APPROVED',
      };

      const res = await request(app)
        .patch(`/evaluations/${ctx.evaluationId}`)
        .send(patch)
        .expect('Content-Type', /json/);

      expect(res.status).toBe(200);
      expect(res.body).toEqual(
        expect.objectContaining({
          evaluation_id: ctx.evaluationId,
          session_id: ctx.sessionId,
          question_id: ctx.questionId,
          ai_suggested_score: ctx.aiScore, // điểm AI gốc được giữ nguyên
          ...patch,
        }),
      );
      expect(typeof res.body.final_score).toBe('number');

      // Đọc lại để chắc chắn dữ liệu đã được lưu
      const getRes = await request(app).get(`/evaluations/${ctx.evaluationId}`);
      expect(getRes.status).toBe(200);
      expect(getRes.body.status).toBe('APPROVED');
      expect(getRes.body.final_score).toBe(9);
    });
  });

  // ---------------------------------------------------------------------------
  // Kiểm chứng cô lập dữ liệu
  // ---------------------------------------------------------------------------
  describe('Data isolation & persistence', () => {
    test('Dữ liệu được ghi vào file JSON test riêng', async () => {
      await db.flush();
      expect(fs.existsSync(testDbPath)).toBe(true);

      const data = JSON.parse(fs.readFileSync(testDbPath, 'utf8'));
      const find = (entries, id) => (entries.find(([key]) => key === id) || [])[1];

      expect(find(data.topics, ctx.topicId)).toEqual(expect.objectContaining({ course_id: 'SWD392' }));
      expect(find(data.rubrics, ctx.rubricId)).toEqual(expect.objectContaining({ max_score: 10 }));
      expect(data.rubricCriteria.filter(([, c]) => c.rubric_id === ctx.rubricId)).toHaveLength(3);
      expect(find(data.questions, ctx.questionId)).toEqual(
        expect.objectContaining({ topic_id: ctx.topicId, rubric_id: ctx.rubricId }),
      );
      expect(find(data.evaluations, ctx.evaluationId)).toEqual(
        expect.objectContaining({ status: 'APPROVED', final_score: 9 }),
      );
    });

    test('File mock-database.json gốc không bị thay đổi', () => {
      expect(t.originalDbUnchanged()).toBe(true);
    });
  });
});
