jest.mock('uuid', () => ({ v4: () => 'mock-uuid-1234' }));
const request = require('supertest');
const { createApp } = require('../src/app');
const { InMemoryDatabase } = require('../src/db/createDatabase');
const fs = require('fs');
const path = require('path');

let app;
let db;
let testDbPath;

beforeAll(() => {
  // Use a separate test database file to not mess up the main one
  testDbPath = path.join(__dirname, 'test-mock-database.json');
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }
  
  db = new InMemoryDatabase();
  db.dbFilePath = testDbPath;
  
  // Clean state for tests
  db.topics = new Map();
  db.rubrics = new Map();
  db.rubricCriteria = new Map();
  db.questions = new Map();
  db.evaluations = new Map();
  db.nextTopicId = 1;
  db.nextRubricId = 1;
  db.nextCriterionId = 1;
  db.nextQuestionId = 1;
  db.nextEvaluationId = 1;

  app = createApp({ database: db });
});

afterAll(() => {
  // Clean up
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }
});

describe('AIVES System E2E Workflows', () => {
  let topicId;
  let rubricId;
  let questionId;
  let sessionId;
  let evaluationId;
  let objectKey = 'mock-audio-file.mp3';

  describe('Luồng 1: Giảng viên chuẩn bị bộ đề', () => {
    it('B1: Giảng viên tạo một Topic mới', async () => {
      const response = await request(app)
        .post('/topics')
        .send({
          name: 'Node.js Interview',
          course_id: 'SWD392'
        });
        
      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('topic_id');
      expect(response.body.name).toBe('Node.js Interview');
      expect(response.body.course_id).toBe('SWD392');
      
      topicId = response.body.topic_id;
    });

    it('B2: Giảng viên tạo một Rubric kèm theo các criteria', async () => {
      const response = await request(app)
        .post('/rubrics')
        .send({
          maxScore: 10,
          criteria: [
            { name: 'Technical Knowledge', weightPercent: 60, description: 'Understands Node.js core' },
            { name: 'Communication', weightPercent: 40, description: 'Explains clearly' }
          ]
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(response.body.maxScore).toBe(10);
      
      rubricId = response.body.id;
    });

    it('B3: Giảng viên tạo một câu hỏi mới, gán topic_id và rubric_id', async () => {
      const response = await request(app)
        .post('/questions')
        .send({
          topicId: topicId,
          rubricId: rubricId,
          content: 'What is Event Loop in Node.js?',
          status: 'Active'
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(response.body.topicId).toBe(topicId);
      expect(response.body.rubricId).toBe(rubricId);
      
      questionId = response.body.id;
    });
  });

  describe('Luồng 2: Sinh viên thi phỏng vấn với AI', () => {
    it('B4: Tạo một phiên tải âm thanh mới (Upload Session)', async () => {
      const response = await request(app)
        .post('/api/audio/upload-url')
        .send({});
        
      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('sessionId');
      expect(response.body).toHaveProperty('uploadUrl');
      
      sessionId = response.body.sessionId;
    });

    it('B5: Mô phỏng quá trình AI nhận diện giọng nói và chấm điểm (Webhook)', async () => {
      const response = await request(app)
        .post('/api/audio/process')
        .send({
          sessionId: sessionId,
          objectKey: objectKey
        });

      // API audioRoutes trả về HTTP 202 cho quá trình xử lý background
      expect(response.status).toBe(202);
      expect(response.body).toHaveProperty('status', 'PROCESSING');
    });
  });

  describe('Luồng 3: Giảng viên duyệt kết quả', () => {
    it('B6: Tạo một bảng điểm đánh giá nháp (Evaluation)', async () => {
      const response = await request(app)
        .post('/evaluations')
        .send({
          session_id: sessionId,
          student_id: 'SE150000',
          question_id: questionId,
          ai_suggested_score: 8.5,
          ai_feedback: 'Good understanding of Event Loop',
          status: 'PENDING'
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('evaluation_id');
      expect(response.body.status).toBe('PENDING');
      
      evaluationId = response.body.evaluation_id;
    });

    it('B7: Giảng viên sửa/chốt điểm và đổi status thành APPROVED', async () => {
      const response = await request(app)
        .patch(`/evaluations/${evaluationId}`)
        .send({
          final_score: 9.0,
          lecturer_feedback: 'Excellent explanation, very clear.',
          status: 'APPROVED'
        });

      expect(response.status).toBe(200);
      expect(response.body.final_score).toBe(9.0);
      expect(response.body.lecturer_feedback).toBe('Excellent explanation, very clear.');
      expect(response.body.status).toBe('APPROVED');
    });
  });
});
