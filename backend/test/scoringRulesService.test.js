const test = require('node:test');
const assert = require('node:assert/strict');
const {
  calculateQuestionScore,
  calculateVivaTotalScore,
  detectFlagReason,
  assertValidScoreAdjustment,
} = require('../src/domain/scoringRules');

test('calculateQuestionScore computes weighted score normalized to 10-point scale', () => {
  const criteria = [
    { criterion_id: 1, weight: 40, max_score: 10 },
    { criterion_id: 2, weight: 60, max_score: 10 },
  ];

  // 1: 8/10 (0.8 * 40 = 32), 2: 9/10 (0.9 * 60 = 54) -> sum = 86 -> 8.6
  const evaluations = [
    { criterion_id: 1, score: 8 },
    { criterion_id: 2, score: 9 },
  ];

  const score = calculateQuestionScore(evaluations, criteria);
  assert.equal(score, 8.6);
});

test('calculateVivaTotalScore averages question scores and rounds to 1 decimal', () => {
  const scores = [8.6, 7.4, 9.0];
  // (8.6 + 7.4 + 9.0) / 3 = 25.0 / 3 = 8.333... -> 8.3
  const total = calculateVivaTotalScore(scores);
  assert.equal(total, 8.3);
});

test('detectFlagReason flags when confidence < 0.6 or turn failed', () => {
  // Normal case
  assert.deepEqual(
    detectFlagReason({
      questionEvaluations: [{ confidence: 0.85 }, { confidence: 0.90 }],
      turns: [{ status: 'ANSWERED' }],
    }),
    { isFlagged: false, flagReason: null }
  );

  // Low confidence
  const lowConf = detectFlagReason({
    questionEvaluations: [{ confidence: 0.55 }],
    turns: [{ status: 'ANSWERED' }],
  });
  assert.equal(lowConf.isFlagged, true);
  assert.match(lowConf.flagReason, /Low AI confidence/);

  // Failed turn
  const failedTurn = detectFlagReason({
    questionEvaluations: [{ confidence: 0.9 }],
    turns: [{ status: 'FAILED', sequence_no: 2 }],
  });
  assert.equal(failedTurn.isFlagged, true);
  assert.match(failedTurn.flagReason, /Audio or STT failure/);
});

test('assertValidScoreAdjustment requires a reason when score changes', () => {
  // No change: no reason required
  assert.doesNotThrow(() => {
    assertValidScoreAdjustment({ oldScore: 8.5, newScore: 8.5, reason: '' });
  });

  // Score changed without reason: throws
  assert.throws(
    () => {
      assertValidScoreAdjustment({ oldScore: 8.5, newScore: 9.0, reason: '' });
    },
    (err) => err.code === 'REASON_REQUIRED'
  );

  // Score changed with reason: passes
  assert.doesNotThrow(() => {
    assertValidScoreAdjustment({ oldScore: 8.5, newScore: 9.0, reason: 'Excellent real-world explanation' });
  });
});
