// Pure decision order for what happens after a student answer (spec order,
// do not reorder):
//   (1) session deadline passed           -> END_SESSION
//   (2) empty answer                      -> NEXT_MAIN (no follow-up)
//   (3) LLM proposes a follow-up AND follow-ups remain -> ASK_FOLLOW_UP
//   (4) otherwise                         -> NEXT_MAIN
// The engine maps NEXT_MAIN with no remaining main question to an end with
// QUESTIONS_EXHAUSTED. The LLM can never extend limits: (3) is gated by BOTH
// the lecturer-set max_follow_ups_per_question and, when set (Step 12),
// max_follow_ups_total across the whole interview, regardless of what it
// proposes. maxFollowUpsTotal null/undefined = no total cap.

function isEmptyAnswer(answerText) {
  return String(answerText ?? '').trim() === '';
}

// Follow-ups still allowed for this turn: the smaller of the per-question and
// the per-candidate remainder (never negative).
function followUpsRemaining({
  followUpsUsed, maxFollowUps, totalFollowUpsUsed, maxFollowUpsTotal,
}) {
  const perQuestion = (Number(maxFollowUps) || 0) - (Number(followUpsUsed) || 0);
  let remaining = perQuestion;
  if (maxFollowUpsTotal !== null && maxFollowUpsTotal !== undefined && maxFollowUpsTotal !== '') {
    const total = (Number(maxFollowUpsTotal) || 0) - (Number(totalFollowUpsUsed) || 0);
    remaining = Math.min(remaining, total);
  }
  return Math.max(0, remaining);
}

function decideNextStep({
  now, deadlineAt, answerText, followUpsUsed, maxFollowUps, totalFollowUpsUsed, maxFollowUpsTotal, llmDecision,
}) {
  if (now.getTime() >= new Date(deadlineAt).getTime()) {
    return { action: 'END_SESSION', reason: 'DEADLINE_REACHED' }; // (1)
  }
  if (isEmptyAnswer(answerText)) {
    return { action: 'NEXT_MAIN', reason: 'EMPTY_ANSWER' }; // (2)
  }
  const remaining = followUpsRemaining({
    followUpsUsed, maxFollowUps, totalFollowUpsUsed, maxFollowUpsTotal,
  });
  if (llmDecision && llmDecision.next_action === 'ASK_FOLLOW_UP' && remaining > 0) {
    return { action: 'ASK_FOLLOW_UP', reason: 'LLM_FOLLOW_UP' }; // (3)
  }
  let reason;
  if (llmDecision) reason = 'LLM_NEXT_MAIN';
  else if (remaining <= 0) reason = 'FOLLOW_UPS_EXHAUSTED';
  else reason = 'LLM_UNAVAILABLE';
  return { action: 'NEXT_MAIN', reason }; // (4)
}

// The LLM is only consulted when its answer could change the outcome: a
// non-empty answer with follow-ups still available under both caps. Same
// result, less cost.
function shouldConsultLlm({
  answerText, followUpsUsed, maxFollowUps, totalFollowUpsUsed, maxFollowUpsTotal,
}) {
  if (isEmptyAnswer(answerText)) return false;
  return followUpsRemaining({
    followUpsUsed, maxFollowUps, totalFollowUpsUsed, maxFollowUpsTotal,
  }) > 0;
}

module.exports = {
  decideNextStep, shouldConsultLlm, isEmptyAnswer, followUpsRemaining,
};
