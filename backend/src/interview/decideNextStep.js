// Pure decision order for what happens after a student answer (spec order,
// do not reorder):
//   (1) session deadline passed           -> END_SESSION
//   (2) empty answer                      -> NEXT_MAIN (no follow-up)
//   (3) LLM proposes a follow-up AND follow-ups remain -> ASK_FOLLOW_UP
//   (4) otherwise                         -> NEXT_MAIN
// The engine maps NEXT_MAIN with no remaining main question to an end with
// QUESTIONS_EXHAUSTED. The LLM can never extend limits: (3) is gated by the
// lecturer-set max_follow_ups_per_question regardless of what it proposes.

function isEmptyAnswer(answerText) {
  return String(answerText ?? '').trim() === '';
}

function decideNextStep({
  now, deadlineAt, answerText, followUpsUsed, maxFollowUps, llmDecision,
}) {
  if (now.getTime() >= new Date(deadlineAt).getTime()) {
    return { action: 'END_SESSION', reason: 'DEADLINE_REACHED' }; // (1)
  }
  if (isEmptyAnswer(answerText)) {
    return { action: 'NEXT_MAIN', reason: 'EMPTY_ANSWER' }; // (2)
  }
  const used = Number(followUpsUsed) || 0;
  const max = Number(maxFollowUps) || 0;
  if (llmDecision && llmDecision.next_action === 'ASK_FOLLOW_UP' && used < max) {
    return { action: 'ASK_FOLLOW_UP', reason: 'LLM_FOLLOW_UP' }; // (3)
  }
  let reason;
  if (llmDecision) reason = 'LLM_NEXT_MAIN';
  else if (used >= max) reason = 'FOLLOW_UPS_EXHAUSTED';
  else reason = 'LLM_UNAVAILABLE';
  return { action: 'NEXT_MAIN', reason }; // (4)
}

// The LLM is only consulted when its answer could change the outcome: a
// non-empty answer with follow-ups still available. Same result, less cost.
function shouldConsultLlm({ answerText, followUpsUsed, maxFollowUps }) {
  if (isEmptyAnswer(answerText)) return false;
  return (Number(followUpsUsed) || 0) < (Number(maxFollowUps) || 0);
}

module.exports = { decideNextStep, shouldConsultLlm, isEmptyAnswer };
