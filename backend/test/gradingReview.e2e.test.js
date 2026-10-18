const request = require('supertest');
const { createApp } = require('../src/app');
const { ACCESS_COOKIE } = require('../src/auth/cookieNames');

describe('AIVES AI Grading & Lecturer Review (Step 8)', () => {
  let app;
  let tokenService;
  let gradingService;
  let vivaResultRepo;
  let fakeDb;

  const adminUser = { id: 1, email: 'admin@aives.local', role: 'ADMIN' };
  const lecturerUser = { id: 2, email: 'lecturer@aives.local', role: 'LECTURER' };
  const outOfScopeLecturer = { id: 999, email: 'outsider@aives.local', role: 'LECTURER' };
  const studentUser = { id: 10, email: 'student@aives.local', role: 'STUDENT' };

  let adminCookie;
  let lecturerCookie;
  let outsiderCookie;
  let studentCookie;

  beforeAll(() => {
    tokenService = {
      sign(claims) {
        return `fake-jwt-${claims.sub}-${claims.role}`;
      },
      verify(token) {
        if (!token || !token.startsWith('fake-jwt-')) {
          const err = new Error('Invalid token');
          err.code = 'INVALID_TOKEN';
          throw err;
        }
        const parts = token.split('-');
        return {
          sub: Number(parts[2]),
          role: parts[3],
          email: `${parts[3].toLowerCase()}@aives.local`,
        };
      },
    };

    adminCookie = `${ACCESS_COOKIE}=fake-jwt-1-ADMIN`;
    lecturerCookie = `${ACCESS_COOKIE}=fake-jwt-2-LECTURER`;
    outsiderCookie = `${ACCESS_COOKIE}=fake-jwt-999-LECTURER`;
    studentCookie = `${ACCESS_COOKIE}=fake-jwt-10-STUDENT`;

    const sampleResult = {
      viva_result_id: 1,
      interview_id: 100,
      status: 'AI_SUGGESTED',
      ai_total_score: 8.5,
      final_total_score: 8.5,
      finalized_by: null,
      finalized_at: null,
      exam_session_id: 5,
    };

    const sampleDetail = {
      result: {
        ...sampleResult,
        student_id: 10,
        student_name: 'Nguyen Van A',
        student_code: 'SE123456',
        session_title: 'Java OOP Viva',
        subject_id: 1,
      },
      evaluations: [
        {
          question_evaluation_id: 1,
          assigned_question_id: 10,
          ai_score: 8.5,
          final_score: 8.5,
          confidence: 0.92,
          strengths: 'Understands encapsulation well',
          weaknesses: '',
          feedback: 'Solid performance',
          criteria: [
            {
              criterion_score_id: 101,
              criterion_id: 1,
              criterion_name: 'Conceptual Understanding',
              weight: 100,
              max_score: 10,
              ai_score: 8.5,
              final_score: 8.5,
              ai_justification: 'Clear definitions provided',
              evidence: [{ quote: 'Encapsulation is data hiding' }],
            },
          ],
          turns: [
            {
              qa_turn_id: 1,
              turn_type: 'MAIN',
              question_text: 'Explain encapsulation in OOP.',
              answer_text: 'Encapsulation is data hiding where fields are private.',
              status: 'ANSWERED',
              response_latency_ms: 1200,
              speech_duration_ms: 14500,
              words_per_minute: 135,
              pause_count: 1,
            },
          ],
        },
      ],
      scoreAdjustments: [],
    };

    vivaResultRepo = {
      async listBySession(sessionId) {
        return [sampleResult];
      },
      async getFullResultDetail(resultId) {
        return sampleDetail;
      },
      async findCriterionScoreById(id) {
        return {
          criterion_score_id: 101,
          question_evaluation_id: 1,
          result_id: 1,
          ai_score: 8.5,
          final_score: 8.5,
        };
      },
      async insertScoreAdjustment(adj) {
        sampleDetail.scoreAdjustments.push(adj);
        return adj;
      },
      async updateCriterionScore(id, { finalScore }) {
        sampleDetail.evaluations[0].criteria[0].final_score = finalScore;
        return { criterion_score_id: id, final_score: finalScore };
      },
      async updateEvaluationScore(id, { finalScore }) {
        sampleDetail.evaluations[0].final_score = finalScore;
        return { question_evaluation_id: id, final_score: finalScore };
      },
      async updateResult(id, fields) {
        Object.assign(sampleDetail.result, fields);
        Object.assign(sampleResult, fields);
        return sampleDetail.result;
      },
    };

    fakeDb = {
      async query(sql, params) {
        if (sql.includes('FROM exam_session es')) {
          return { rows: [{ subject_id: 1 }] };
        }
        if (sql.includes('FROM subject_lecturer')) {
          // params: [subjectId, lecturerId]
          if (params[1] === 999) return { rows: [] };
          return { rows: [{ subject_id: params[0], lecturer_id: params[1] }] };
        }
        return { rows: [] };
      },
    };

    const { GradingService } = require('../src/services/gradingService');
    const gradingService = new GradingService({
      db: fakeDb,
      vivaResultRepository: vivaResultRepo,
      llmAdapter: {},
      enqueueJob: async () => {},
    });

    app = createApp({
      database: fakeDb,
      tokenService,
      vivaResultRepository: vivaResultRepo,
      gradingService,
    });
  });

  describe('GET /api/exam-sessions/:id/results', () => {
    it('rejects unauthenticated requests with 401', async () => {
      await request(app)
        .get('/api/exam-sessions/5/results')
        .expect(401);
    });

    it('rejects student role with 403', async () => {
      await request(app)
        .get('/api/exam-sessions/5/results')
        .set('Cookie', studentCookie)
        .expect(403);
    });

    it('rejects out-of-scope lecturer with 403', async () => {
      await request(app)
        .get('/api/exam-sessions/5/results')
        .set('Cookie', outsiderCookie)
        .expect(403);
    });

    it('allows in-scope lecturer to list results', async () => {
      const res = await request(app)
        .get('/api/exam-sessions/5/results')
        .set('Cookie', lecturerCookie)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(1);
      expect(res.body[0].status).toBe('AI_SUGGESTED');
    });
  });

  describe('GET /api/results/:id', () => {
    it('returns full result detail with student info, evaluations, and criteria', async () => {
      const res = await request(app)
        .get('/api/results/1')
        .set('Cookie', lecturerCookie)
        .expect(200);

      expect(res.body.result).toBeDefined();
      expect(res.body.result.student_name).toBe('Nguyen Van A');
      expect(res.body.evaluations.length).toBe(1);
      expect(res.body.evaluations[0].criteria.length).toBe(1);
      expect(res.body.evaluations[0].turns.length).toBe(1);
      expect(res.body.evaluations[0].turns[0].words_per_minute).toBe(135);
    });
  });

  describe('PUT /api/criterion-scores/:id', () => {
    it('rejects score adjustment without a reason', async () => {
      const res = await request(app)
        .put('/api/criterion-scores/101')
        .set('Cookie', lecturerCookie)
        .set('Origin', 'http://localhost:8080')
        .send({ score: 9.0, reason: '' })
        .expect(400);

      expect(res.body.code).toBe('REASON_REQUIRED');
    });

    it('applies score adjustment when valid reason is provided', async () => {
      const res = await request(app)
        .put('/api/criterion-scores/101')
        .set('Cookie', lecturerCookie)
        .set('Origin', 'http://localhost:8080')
        .send({ score: 9.5, reason: 'Excellent code example given during viva' })
        .expect(200);

      expect(res.body.evaluations[0].criteria[0].final_score).toBe(9.5);
      expect(res.body.scoreAdjustments.length).toBeGreaterThan(0);
    });
  });

  describe('Finalize and Reopen flow', () => {
    it('finalizes viva result and locks it', async () => {
      const res = await request(app)
        .post('/api/results/1/finalize')
        .set('Cookie', lecturerCookie)
        .set('Origin', 'http://localhost:8080')
        .expect(200);

      expect(res.body.status).toBe('FINALIZED');
      expect(res.body.finalized_by).toBe(2);
    });

    it('blocks score adjustments on finalized results', async () => {
      const res = await request(app)
        .put('/api/criterion-scores/101')
        .set('Cookie', lecturerCookie)
        .set('Origin', 'http://localhost:8080')
        .send({ score: 10, reason: 'Trying to adjust after finalize' })
        .expect(400);

      expect(res.body.code).toBe('RESULT_FINALIZED');
    });

    it('reopens finalized result for editing', async () => {
      const res = await request(app)
        .post('/api/results/1/reopen')
        .set('Cookie', lecturerCookie)
        .set('Origin', 'http://localhost:8080')
        .expect(200);

      expect(res.body.status).toBe('AI_SUGGESTED');
      expect(res.body.finalized_by).toBeNull();
    });
  });
});
