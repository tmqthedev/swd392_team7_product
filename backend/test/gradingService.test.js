const test = require('node:test');
const assert = require('node:assert/strict');
const { GradingService } = require('../src/services/gradingService');

function createMockDb() {
  const state = {
    vivaResults: new Map(),
    evaluations: new Map(),
    criterionScores: new Map(),
    adjustments: [],
  };

  return {
    state,
    async query(sql, params = []) {
      const s = sql.trim();
      if (s.startsWith('INSERT INTO viva_result')) {
        const id = state.vivaResults.size + 1;
        const row = { viva_result_id: id, interview_id: params[0], status: params[1] };
        state.vivaResults.set(id, row);
        return { rows: [row] };
      }
      if (s.includes('FROM viva_interview vi')) {
        return {
          rows: [
            {
              viva_interview_id: params[0],
              exam_session_id: 10,
              student_id: 200,
              exam_language: 'EN',
              session_title: 'Java OOP Exam',
            },
          ],
        };
      }
      if (s.includes('FROM assigned_question aq')) {
        return {
          rows: [
            {
              assigned_question_id: 1,
              order_no: 1,
              question_id: 50,
              question_content: 'Explain Encapsulation in OOP.',
              bloom_level: 'UNDERSTAND',
              reference_answer: 'Data hiding with private fields and public accessors.',
              key_points: ['Data hiding', 'Private fields', 'Getters and setters'],
              rubric_id: 5,
            },
          ],
        };
      }
      if (s.includes('FROM qa_turn WHERE interview_id')) {
        return {
          rows: [
            {
              qa_turn_id: 1,
              interview_id: params[0],
              assigned_question_id: 1,
              sequence_no: 1,
              turn_type: 'MAIN',
              question_text: 'Explain Encapsulation in OOP.',
              answer_text: 'Encapsulation is data hiding where fields are kept private and accessed via public getters and setters.',
              status: 'ANSWERED',
            },
          ],
        };
      }
      if (s.includes('FROM rubric_criterion rc')) {
        return {
          rows: [
            {
              rubric_criterion_id: 1,
              rubric_id: 5,
              criterion_name: 'Conceptual Clarity',
              weight_percent: 100,
            },
          ],
        };
      }
      if (s.includes('FROM performance_level')) {
        return {
          rows: [
            {
              performance_level_id: 10,
              criterion_id: 1,
              label: 'Excellent',
              min_score: 8,
              max_score: 10,
              description: 'Clear and comprehensive',
            },
          ],
        };
      }
      if (s.includes('FROM subject_lecturer')) {
        // params: [subjectId, lecturerId]
        if (params[1] === 999) return { rows: [] }; // unassigned
        return { rows: [{ subject_id: params[0], lecturer_id: params[1] }] };
      }
      if (s.includes('FROM exam_session es')) {
        return { rows: [{ subject_id: 1 }] };
      }
      return { rows: [] };
    },
    async withTransaction(fn) {
      return fn({
        query: async (sql, params = []) => {
          if (sql.includes('INSERT INTO question_evaluation')) {
            const id = state.evaluations.size + 1;
            const row = {
              question_evaluation_id: id,
              result_id: params[0],
              assigned_question_id: params[1],
              ai_score: params[2],
              final_score: params[3],
              confidence: params[4],
            };
            state.evaluations.set(id, row);
            return { rows: [row] };
          }
          if (sql.includes('INSERT INTO criterion_score')) {
            const id = state.criterionScores.size + 1;
            const row = {
              criterion_score_id: id,
              evaluation_id: params[0],
              criterion_id: params[1],
              ai_level_id: params[2],
              ai_score: params[3],
              final_score: params[6],
            };
            state.criterionScores.set(id, row);
            return { rows: [row] };
          }
          return { rows: [] };
        },
      });
    },
  };
}

function createMockRepo(db) {
  let resultRecord = { viva_result_id: 1, interview_id: 100, status: 'PENDING' };
  return {
    async findByInterviewId(interviewId) {
      return resultRecord.interview_id === interviewId ? resultRecord : null;
    },
    async updateResult(id, fields) {
      resultRecord = { ...resultRecord, ...fields };
      return resultRecord;
    },
    async saveEvaluationsAndCriteria(resultId, evals) {
      return db.withTransaction(async (client) => {
        for (const ev of evals) {
          const res = await client.query('INSERT INTO question_evaluation', [
            resultId,
            ev.assigned_question_id,
            ev.ai_score,
            ev.final_score,
            ev.confidence,
          ]);
          for (const cs of (ev.criteria || [])) {
            await client.query('INSERT INTO criterion_score', [
              res.rows[0].question_evaluation_id,
              cs.criterion_id,
              cs.ai_level_id,
              cs.ai_score,
              '',
              '[]',
              cs.final_score,
            ]);
          }
        }
      });
    },
    async findCriterionScoreById(id) {
      return {
        criterion_score_id: id,
        evaluation_id: 1,
        result_id: 1,
        ai_score: 8.5,
        final_score: 8.5,
        question_evaluation_id: 1,
      };
    },
    async insertScoreAdjustment(adj) {
      db.state.adjustments.push(adj);
      return adj;
    },
    async updateCriterionScore(id, { finalScore }) {
      return { criterion_score_id: id, final_score: finalScore };
    },
    async updateEvaluationScore(id, { finalScore }) {
      return { question_evaluation_id: id, final_score: finalScore };
    },
    async getFullResultDetail(id) {
      return {
        result: { ...resultRecord, exam_session_id: 10 },
        evaluations: [
          {
            question_evaluation_id: 1,
            final_score: 8.5,
            criteria: [{ criterion_score_id: 1, criterion_id: 1, final_score: 8.5, weight: 100, max_score: 10 }],
          },
        ],
        scoreAdjustments: db.state.adjustments,
      };
    },
    async listBySession(sessionId) {
      return [resultRecord];
    },
    async isExaminerOrCreator(sessionId, userId) {
      return userId !== 999;
    },
  };
}

test('gradeInterview scores interview via LLM and transitions to AI_SUGGESTED', async () => {
  const db = createMockDb();
  const repo = createMockRepo(db);
  const mockLlm = {
    async gradeQuestion() {
      return {
        criteria_evaluations: [
          {
            criterion_id: 1,
            ai_level_id: 10,
            ai_score: 8.5,
            ai_justification: 'Well explained',
            evidence: [{ quote: 'Encapsulation is data hiding' }],
          },
        ],
        strengths: 'Clear definitions',
        weaknesses: '',
        missing_points: [],
        feedback: 'Good work',
        confidence: 0.90,
      };
    },
  };

  const service = new GradingService({
    db,
    vivaResultRepository: repo,
    llmAdapter: mockLlm,
    enqueueJob: async () => {},
  });

  const res = await service.gradeInterview({ interviewId: 100 });
  assert.equal(res.status, 'AI_SUGGESTED');
  assert.equal(res.ai_total_score, 8.5);
  assert.equal(res.final_total_score, 8.5);
});

test('gradeInterview marks FLAGGED when AI confidence < 0.6', async () => {
  const db = createMockDb();
  const repo = createMockRepo(db);
  const mockLlm = {
    async gradeQuestion() {
      return {
        criteria_evaluations: [{ criterion_id: 1, ai_score: 5.0 }],
        confidence: 0.45,
      };
    },
  };

  const service = new GradingService({
    db,
    vivaResultRepository: repo,
    llmAdapter: mockLlm,
    enqueueJob: async () => {},
  });

  const res = await service.gradeInterview({ interviewId: 100 });
  assert.equal(res.status, 'FLAGGED');
});

test('gradeInterview rejects invented performance levels without storing invalid foreign keys', async () => {
  const db = createMockDb();
  const repo = createMockRepo(db);
  const service = new GradingService({ db, vivaResultRepository: repo,
    llmAdapter: { async gradeQuestion() { return {
      criteria_evaluations: [{ criterion_id: 1, ai_level_id: 9999, ai_score: 8,
        ai_justification: 'Explanation is clear' }], confidence: 0.9,
    }; } }, enqueueJob: async () => {} });
  const result = await service.gradeInterview({ interviewId: 100 });
  assert.equal(result.status, 'FLAGGED');
  assert.equal([...db.state.criterionScores.values()][0].ai_level_id, null);
  assert.equal(result.ai_total_score, 8);
});

test('adjustCriterionScore records adjustment history and requires a reason', async () => {
  const db = createMockDb();
  const repo = createMockRepo(db);
  const service = new GradingService({
    db,
    vivaResultRepository: repo,
    llmAdapter: {},
    enqueueJob: async () => {},
  });

  // Fails without reason
  await assert.rejects(
    () => service.adjustCriterionScore({
      criterionScoreId: 1,
      newScore: 9.5,
      reason: '',
      user: { id: 2, role: 'LECTURER' },
    }),
    (err) => err.code === 'REASON_REQUIRED'
  );

  // Succeeds with reason
  const updated = await service.adjustCriterionScore({
    criterionScoreId: 1,
    newScore: 9.5,
    reason: 'Student provided brilliant extra context',
    user: { id: 2, role: 'LECTURER' },
  });

  assert.equal(db.state.adjustments.length, 1);
  assert.equal(db.state.adjustments[0].newScore, 9.5);
  assert.equal(db.state.adjustments[0].reason, 'Student provided brilliant extra context');
});

test('finalize and reopen transitions result state', async () => {
  const db = createMockDb();
  const repo = createMockRepo(db);
  const service = new GradingService({
    db,
    vivaResultRepository: repo,
    llmAdapter: {},
    enqueueJob: async () => {},
  });

  const finalized = await service.finalizeResult({ resultId: 1, user: { id: 2, role: 'LECTURER' } });
  assert.equal(finalized.status, 'FINALIZED');
  assert.equal(finalized.finalized_by, 2);

  const reopened = await service.reopenResult({ resultId: 1, user: { id: 2, role: 'LECTURER' } });
  assert.equal(reopened.status, 'AI_SUGGESTED');
  assert.equal(reopened.finalized_by, null);
});

test('assertSessionAccess forbids access for out-of-scope lecturer', async () => {
  const db = createMockDb();
  const repo = createMockRepo(db);
  const service = new GradingService({
    db,
    vivaResultRepository: repo,
    llmAdapter: {},
    enqueueJob: async () => {},
  });

  await assert.rejects(
    () => service.listSessionResults({ examSessionId: 10, user: { id: 999, role: 'LECTURER' } }),
    (err) => err.code === 'FORBIDDEN'
  );
});

test('gradeInterview flags a question whose criteria the AI left out', async () => {
  const db = createMockDb();
  const repo = createMockRepo(db);
  const mockLlm = {
    async gradeQuestion() {
      // Rubric criterion 1 is missing from the AI output.
      return { criteria_evaluations: [], confidence: 0.9, strengths: '', weaknesses: '', missing_points: [], feedback: '' };
    },
  };
  const service = new GradingService({ db, vivaResultRepository: repo, llmAdapter: mockLlm, enqueueJob: async () => {} });

  const res = await service.gradeInterview({ interviewId: 100 });
  assert.equal(res.status, 'FLAGGED');
  const rows = [...db.state.criterionScores.values()];
  assert.ok(rows.some((r) => Number(r.criterion_id) === 1 && r.ai_score == null));
});

test('gradeInterview rethrows transient errors so JobQueue can retry', async () => {
  const db = createMockDb();
  const repo = createMockRepo(db);
  const mockLlm = {
    async gradeQuestion() {
      const err = new Error('Rate exceeded');
      err.name = 'ThrottlingException';
      throw err;
    },
  };
  const service = new GradingService({ db, vivaResultRepository: repo, llmAdapter: mockLlm, enqueueJob: async () => {} });

  await assert.rejects(
    () => service.gradeInterview({ interviewId: 100 }),
    /Rate exceeded/
  );
});
