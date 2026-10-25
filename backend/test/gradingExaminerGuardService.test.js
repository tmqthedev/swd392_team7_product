const test = require('node:test');
const assert = require('node:assert/strict');
const { GradingService } = require('../src/services/gradingService');

function setupTest() {
  const state = {
    result: {
      viva_result_id: 1,
      interview_id: 10,
      exam_session_id: 42,
      status: 'AI_SUGGESTED',
      final_total_score: 8.0,
      ai_total_score: 8.0,
    },
    criterionScore: {
      criterion_score_id: 101,
      evaluation_id: 1,
      result_id: 1,
      final_score: 8.0,
      ai_score: 8.0,
    },
    evaluations: [
      {
        question_evaluation_id: 1,
        final_score: 8.0,
        criteria: [
          {
            criterion_score_id: 101,
            criterion_id: 1,
            final_score: 8.0,
            ai_score: 8.0,
            weight: 100,
            max_score: 10,
          },
        ],
      },
    ],
    adjustments: [],
  };

  const examiners = new Set([20]); // Lecturer 20 is an examiner
  const examCreatorId = 30; // Lecturer 30 is the creator
  const assignedLecturers = new Set([20, 30, 40]); // Lecturer 40 is teaching the subject, but is NOT examiner or creator

  const db = {
    async query(sql, params = []) {
      if (sql.includes('FROM exam_session es')) {
        return { rows: [{ subject_id: 1, exam_session_id: 42, created_by: examCreatorId }] };
      }
      if (sql.includes('FROM subject_lecturer')) {
        const lecturerId = params[1];
        if (assignedLecturers.has(lecturerId)) {
          return { rows: [{ subject_id: 1, lecturer_id: lecturerId }] };
        }
        return { rows: [] };
      }
      return { rows: [] };
    },
  };

  const vivaResultRepo = {
    async findCriterionScoreById(id) {
      return Number(id) === state.criterionScore.criterion_score_id ? state.criterionScore : null;
    },
    async getFullResultDetail(id) {
      return {
        result: { ...state.result },
        evaluations: state.evaluations,
        scoreAdjustments: state.adjustments,
      };
    },
    async listBySession(sessionId) {
      return [{ ...state.result }];
    },
    async updateResult(id, fields) {
      Object.assign(state.result, fields);
      return state.result;
    },
    async updateCriterionScore(id, { finalScore }) {
      state.criterionScore.final_score = finalScore;
      return state.criterionScore;
    },
    async updateEvaluationScore(id, { finalScore }) {
      state.evaluations[0].final_score = finalScore;
      return state.evaluations[0];
    },
    async insertScoreAdjustment(adj) {
      state.adjustments.push(adj);
      return adj;
    },
    async isExaminerOrCreator(examSessionId, userId) {
      return userId === examCreatorId || examiners.has(userId);
    },
  };

  const gradingService = new GradingService({
    db,
    vivaResultRepository: vivaResultRepo,
    logger: { info() {}, error() {}, warn() {} },
  });

  return { gradingService, state };
}

test('Examiner permission - Examiner can adjust score, finalize, reopen, and regrade', async () => {
  const { gradingService } = setupTest();
  const examiner = { id: 20, role: 'LECTURER' };

  // adjustCriterionScore allowed
  const adjRes = await gradingService.adjustCriterionScore({
    criterionScoreId: 101,
    newScore: 9.0,
    reason: 'Clearer articulation on second listen',
    user: examiner,
  });
  assert.equal(adjRes.result.final_total_score, 9.0);

  // finalizeResult allowed
  const finRes = await gradingService.finalizeResult({
    resultId: 1,
    user: examiner,
  });
  assert.equal(finRes.status, 'FINALIZED');
  assert.equal(finRes.finalized_by, 20);

  // reopenResult allowed
  const reopenRes = await gradingService.reopenResult({
    resultId: 1,
    user: examiner,
  });
  assert.equal(reopenRes.status, 'AI_SUGGESTED');

  // regradeResult allowed
  const regradeRes = await gradingService.regradeResult({
    resultId: 1,
    user: examiner,
  });
  assert.equal(regradeRes.ok, true);
});

test('Creator permission - Session creator (who is not in examiners list) can also grade', async () => {
  const { gradingService } = setupTest();
  const creator = { id: 30, role: 'LECTURER' };

  const finRes = await gradingService.finalizeResult({
    resultId: 1,
    user: creator,
  });
  assert.equal(finRes.status, 'FINALIZED');
  assert.equal(finRes.finalized_by, 30);
});

test('Non-examiner lecturer - Can read results and get canGrade=false, but write is forbidden (403)', async () => {
  const { gradingService } = setupTest();
  const nonExaminer = { id: 40, role: 'LECTURER' };

  // Read single result detail -> allowed, canGrade is false
  const detail = await gradingService.getResultDetail({
    resultId: 1,
    user: nonExaminer,
  });
  assert.equal(detail.canGrade, false);
  assert.equal(detail.result.canGrade, false);

  // Read session results list -> allowed, canGrade is false on each item
  const list = await gradingService.listSessionResults({
    examSessionId: 42,
    user: nonExaminer,
  });
  assert.equal(list.length, 1);
  assert.equal(list[0].canGrade, false);

  // Attempting write operations throws 403 FORBIDDEN with exact message
  await assert.rejects(
    () => gradingService.adjustCriterionScore({
      criterionScoreId: 101,
      newScore: 9.0,
      reason: 'Should be blocked',
      user: nonExaminer,
    }),
    (err) => err.statusCode === 403 && err.code === 'FORBIDDEN' && err.message === 'Only examiners of this exam can grade.'
  );

  await assert.rejects(
    () => gradingService.finalizeResult({
      resultId: 1,
      user: nonExaminer,
    }),
    (err) => err.statusCode === 403 && err.code === 'FORBIDDEN' && err.message === 'Only examiners of this exam can grade.'
  );

  await assert.rejects(
    () => gradingService.reopenResult({
      resultId: 1,
      user: nonExaminer,
    }),
    (err) => err.statusCode === 403 && err.code === 'FORBIDDEN' && err.message === 'Only examiners of this exam can grade.'
  );

  await assert.rejects(
    () => gradingService.regradeResult({
      resultId: 1,
      user: nonExaminer,
    }),
    (err) => err.statusCode === 403 && err.code === 'FORBIDDEN' && err.message === 'Only examiners of this exam can grade.'
  );
});

test('ADMIN permission - Admin can read and write with canGrade=true', async () => {
  const { gradingService } = setupTest();
  const admin = { id: 99, role: 'ADMIN' };

  const detail = await gradingService.getResultDetail({
    resultId: 1,
    user: admin,
  });
  assert.equal(detail.canGrade, true);

  const finRes = await gradingService.finalizeResult({
    resultId: 1,
    user: admin,
  });
  assert.equal(finRes.status, 'FINALIZED');
});
