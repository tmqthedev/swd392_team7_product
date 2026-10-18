// Builds the rationale snapshot stored in qa_turn.rationale at ask time
// (Step 6). Sources:
//   AI main question      -> question.rationale + question_source_ref excerpts
//                            (re-validated against the chunk content)
//   MANUAL/IMPORT main    -> 'lecturer-authored' rationale (purpose, Bloom,
//                            key points, rubric)
//   follow-up             -> the validated LLM decision
// The snapshot is copied, never referenced, so later edits to the question or
// rubric cannot rewrite why a past question was asked. Rationale is lecturer-
// only: it must never reach a student-facing payload (see studentView.js).

const { validateGrounding } = require('./groundingValidator');

function parseJson(value) {
  if (value == null) return null;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return value;
}

function toStringArray(value) {
  const parsed = parseJson(value);
  return Array.isArray(parsed) ? parsed.map((v) => String(v)) : [];
}

function criterionNames(rubric) {
  const criteria = rubric && Array.isArray(rubric.criteria) ? rubric.criteria : [];
  return criteria.map((c) => c.criterion_name ?? c.name).filter((n) => n != null).map(String);
}

function snapshotTime(now) {
  return (now instanceof Date ? now : new Date(now ?? Date.now())).toISOString();
}

function buildMainRationale({
  question, sourceRefs = [], rubric = null, now,
}) {
  const r = parseJson(question && question.rationale) || {};
  const keyPoints = toStringArray(question && question.key_points);
  const source = (question && question.source) || null;
  const base = {
    question_id: question ? question.question_id : null,
    source,
    bloom_level: (question && question.bloom_level) || null,
    target_criteria: criterionNames(rubric),
    snapshot_at: snapshotTime(now),
  };

  if (source === 'AI') {
    const refs = Array.isArray(sourceRefs) ? sourceRefs : [];
    const { verified, unverified } = validateGrounding(
      refs.map((s) => ({ type: 'SOURCE_EXCERPT', ref: s.chunkId, text: s.excerpt })),
      { sourceChunks: refs.map((s) => ({ chunkId: s.chunkId, content: s.content })) },
    );
    const byChunk = new Map(refs.map((s) => [String(s.chunkId), s]));
    const targetKeyPoints = r.target && Array.isArray(r.target.keyPoints)
      ? r.target.keyPoints.map(String)
      : keyPoints;
    return {
      kind: 'MAIN_AI',
      ...base,
      purpose: r.purpose ?? null,
      target_key_points: targetKeyPoints,
      grounding: verified.map((g) => {
        const ref = byChunk.get(String(g.ref));
        return {
          ...g,
          material_title: ref ? ref.materialTitle ?? null : null,
          location: ref ? ref.location ?? null : null,
        };
      }),
      unverified_grounding: unverified,
      synthesis: r.synthesis ?? null,
    };
  }

  // MANUAL / IMPORT / unknown source: authored by the lecturer.
  return {
    kind: 'MAIN_LECTURER',
    label: 'Câu do giảng viên soạn',
    authored_by: 'lecturer',
    ...base,
    purpose: r.purpose ?? null,
    target_key_points: keyPoints,
    rubric: rubric
      ? {
        rubric_id: rubric.rubric_id ?? null,
        version: rubric.version ?? null,
        criteria: (Array.isArray(rubric.criteria) ? rubric.criteria : []).map((c) => ({
          name: c.criterion_name ?? c.name ?? null,
          weight_percent: c.weight_percent == null ? null : Number(c.weight_percent),
        })),
      }
      : null,
    grounding: [],
    unverified_grounding: [],
  };
}

function buildFollowUpRationale({ decision, groundingResult, now }) {
  const r = (decision && decision.rationale) || {};
  return {
    kind: 'FOLLOW_UP',
    follow_up_reason: decision ? decision.follow_up_reason : null,
    why: r.why ?? null,
    purpose: r.purpose ?? null,
    target_key_points: Array.isArray(r.target_key_points) ? [...r.target_key_points] : [],
    target_criteria: Array.isArray(r.target_criteria) ? [...r.target_criteria] : [],
    covered_key_points: decision ? [...(decision.covered_key_points || [])] : [],
    missing_key_points: decision ? [...(decision.missing_key_points || [])] : [],
    grounding: groundingResult ? groundingResult.verified : [],
    unverified_grounding: groundingResult ? groundingResult.unverified : [],
    synthesis: r.synthesis ?? null,
    snapshot_at: snapshotTime(now),
  };
}

module.exports = {
  buildMainRationale,
  buildFollowUpRationale,
  parseJson,
  toStringArray,
  criterionNames,
};
