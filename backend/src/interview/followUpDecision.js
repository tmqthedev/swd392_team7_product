// Validation of the follow-up JSON contract the LLM must return (Step 6):
//   { next_action, follow_up_reason, covered_key_points, missing_key_points,
//     follow_up_question,
//     rationale: { why, purpose, target_key_points, target_criteria,
//                  grounding: [{ type, ref, text }], synthesis } }
// Anything that does not satisfy the contract is LLM_INVALID_OUTPUT, which the
// engine treats as "retry once, then fall back to the next main question" (A4).
// Grounding entries are NOT validated here: unverifiable citations are filtered
// by groundingValidator and never invalidate the decision itself.

const { normalizeForMatch } = require('./groundingValidator');

const NEXT_ACTIONS = ['ASK_FOLLOW_UP', 'NEXT_MAIN_QUESTION'];
const FOLLOW_UP_REASONS = ['AMBIGUOUS', 'INCOMPLETE', 'CONTRADICTORY', 'NEEDS_CLARIFICATION'];
// The prompt asks for <= ~40 words; 25% tolerance before it counts as invalid.
const MAX_FOLLOW_UP_WORDS = 50;
// Shorter strings are too generic to count as a leak (e.g. "TCP").
const MIN_LEAK_LENGTH = 12;

function invalid(message) {
  return { ok: false, errorCode: 'LLM_INVALID_OUTPUT', message };
}

function isStringArray(value) {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

function countWords(text) {
  return String(text).trim().split(/\s+/).filter((w) => w !== '').length;
}

function countQuestionMarks(text) {
  return (String(text).match(/[?？]/g) || []).length;
}

// True when the question reveals the reference answer or names a key point
// the student has not covered yet.
function leaksAnswer(question, { referenceAnswer, keyPoints, coveredKeyPoints, missingKeyPoints }) {
  const q = normalizeForMatch(question);
  const ref = normalizeForMatch(referenceAnswer);
  if (ref.length >= MIN_LEAK_LENGTH && q.includes(ref)) return true;
  const covered = new Set((coveredKeyPoints || []).map(normalizeForMatch));
  const candidates = [
    ...(Array.isArray(keyPoints) ? keyPoints : []).filter((kp) => !covered.has(normalizeForMatch(kp))),
    ...(missingKeyPoints || []),
  ];
  return candidates.some((kp) => {
    const norm = normalizeForMatch(kp);
    return norm.length >= MIN_LEAK_LENGTH && q.includes(norm);
  });
}

function normalizeRationale(r) {
  return {
    why: r.why,
    purpose: r.purpose,
    target_key_points: [...r.target_key_points],
    target_criteria: [...r.target_criteria],
    grounding: r.grounding.map((g) => (g && typeof g === 'object'
      ? { type: g.type ?? null, ref: g.ref ?? null, text: g.text ?? null }
      : g)),
    synthesis: r.synthesis,
  };
}

function isValidRationale(r) {
  return !!r && typeof r === 'object' && !Array.isArray(r)
    && typeof r.why === 'string'
    && typeof r.purpose === 'string'
    && typeof r.synthesis === 'string'
    && isStringArray(r.target_key_points)
    && isStringArray(r.target_criteria)
    && Array.isArray(r.grounding);
}

function parseFollowUpDecision(raw, { referenceAnswer = null, keyPoints = [] } = {}) {
  let obj = raw;
  if (typeof raw === 'string') {
    try {
      obj = JSON.parse(raw);
    } catch {
      return invalid('Follow-up decision is not valid JSON.');
    }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return invalid('Follow-up decision must be a JSON object.');
  }
  if (!NEXT_ACTIONS.includes(obj.next_action)) {
    return invalid('next_action must be ASK_FOLLOW_UP or NEXT_MAIN_QUESTION.');
  }
  if (!isStringArray(obj.covered_key_points) || !isStringArray(obj.missing_key_points)) {
    return invalid('covered_key_points and missing_key_points must be string arrays.');
  }

  if (obj.next_action === 'NEXT_MAIN_QUESTION') {
    return {
      ok: true,
      value: {
        next_action: 'NEXT_MAIN_QUESTION',
        follow_up_reason: null,
        covered_key_points: [...obj.covered_key_points],
        missing_key_points: [...obj.missing_key_points],
        follow_up_question: null,
        rationale: isValidRationale(obj.rationale) ? normalizeRationale(obj.rationale) : null,
      },
    };
  }

  // ASK_FOLLOW_UP: everything below is required.
  if (!FOLLOW_UP_REASONS.includes(obj.follow_up_reason)) {
    return invalid(`follow_up_reason must be one of ${FOLLOW_UP_REASONS.join(', ')}.`);
  }
  const question = typeof obj.follow_up_question === 'string' ? obj.follow_up_question.trim() : '';
  if (question === '') {
    return invalid('follow_up_question is required for ASK_FOLLOW_UP.');
  }
  if (countWords(question) > MAX_FOLLOW_UP_WORDS) {
    return invalid(`follow_up_question exceeds ${MAX_FOLLOW_UP_WORDS} words.`);
  }
  if (countQuestionMarks(question) > 1) {
    return invalid('follow_up_question must be a single question.');
  }
  if (!isValidRationale(obj.rationale)) {
    return invalid('rationale must carry why/purpose/synthesis strings, target arrays and grounding[].');
  }
  if (leaksAnswer(question, {
    referenceAnswer,
    keyPoints,
    coveredKeyPoints: obj.covered_key_points,
    missingKeyPoints: obj.missing_key_points,
  })) {
    return invalid('follow_up_question leaks the reference answer or a missing key point.');
  }

  return {
    ok: true,
    value: {
      next_action: 'ASK_FOLLOW_UP',
      follow_up_reason: obj.follow_up_reason,
      covered_key_points: [...obj.covered_key_points],
      missing_key_points: [...obj.missing_key_points],
      follow_up_question: question,
      rationale: normalizeRationale(obj.rationale),
    },
  };
}

module.exports = {
  NEXT_ACTIONS,
  FOLLOW_UP_REASONS,
  MAX_FOLLOW_UP_WORDS,
  parseFollowUpDecision,
  leaksAnswer,
};
