const test = require('node:test');
const assert = require('node:assert/strict');
const { GradingService } = require('../src/services/gradingService');

// Rows shaped like VivaResultRepository returns them from Postgres: BIGINT ids
// as strings, rubric weight/max as criterion_weight / criterion_max_score.
function fakeRepo() {
  const state = {
    criteria: [
      { criterion_score_id: '33', criterion_id: 7, ai_score: '2.00', final_score: '2.00', criterion_weight: '50', criterion_max_score: '10' },
      { criterion_score_id: '34', criterion_id: 8, ai_score: '2.00', final_score: '2.00', criterion_weight: '30', criterion_max_score: '10' },
      { criterion_score_id: '35', criterion_id: 9, ai_score: '2.00', final_score: '2.00', criterion_weight: '20', criterion_max_score: '10' },
    ],
    evalScores: { 14: 2, 15: 2 },
    total: null,
  };
  const detail = () => ({
    result: { viva_result_id: 9, exam_session_id: 5, status: 'FLAGGED' },
    evaluations: [
      { question_evaluation_id: '14', final_score: String(state.evalScores[14]), criteria: state.criteria.map((c) => ({ ...c })) },
      { question_evaluation_id: '15', final_score: String(state.evalScores[15]), criteria: [] },
    ],
  });
  return {
    state,
    async findCriterionScoreById(id) {
      const c = state.criteria.find((x) => Number(x.criterion_score_id) === Number(id));
      return c && { ...c, evaluation_id: '14', question_evaluation_id: '14', result_id: '9' };
    },
    async getFullResultDetail() { return detail(); },
    async insertScoreAdjustment() {},
    async updateCriterionScore(id, { finalScore }) {
      state.criteria.find((x) => Number(x.criterion_score_id) === Number(id)).final_score = String(finalScore);
    },
    async updateEvaluationScore(id, { finalScore }) { state.evalScores[Number(id)] = finalScore; },
    async updateResult(_id, fields) { state.total = fields.final_total_score; },
  };
}

test('raising one criterion raises the question and viva totals (weighted, string ids)', async () => {
  const repo = fakeRepo();
  const service = new GradingService({ db: {}, vivaResultRepository: repo, llmAdapter: {}, enqueueJob: async () => {} });
  service._assertSessionAccess = async () => {};

  await service.adjustCriterionScore({
    criterionScoreId: 33, newScore: 6, reason: 'Lecturer review', user: { id: 14, role: 'LECTURER' },
  });

  // (6/10*50 + 2/10*30 + 2/10*20) / 100 * 10 = 4.0
  assert.equal(repo.state.evalScores[14], 4);
  // Viva total = average of question scores (4 and 2).
  assert.equal(Number(repo.state.total), 3);
});
