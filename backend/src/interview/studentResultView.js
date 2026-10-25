// Student-safe DTO for Viva Exam Results (Step 13: Student Results & Examiner Grading).
// Every student-facing result endpoint returns ONLY this structure.
// Built field-by-field with an explicit allowlist. Never spreads raw DB rows.
// assertStudentSafe is called as an independent guard against data leakage.

const { STUDENT_FORBIDDEN_KEYS } = require('./studentView');

const ADDITIONAL_FORBIDDEN_KEYS = [
  'ai_justification',
  'aiJustification',
  'evidence',
  'flag_reason',
  'flagReason',
  'feedback',
  'strengths',
  'weaknesses',
  'score_adjustment',
  'scoreAdjustment',
  'scoreAdjustments',
  'finalized_by',
  'finalizedBy',
  'adjusted_by',
  'adjustedBy',
  'ai_score',
  'aiScore',
  'ai_level_id',
  'aiLevelId',
  'level_id',
  'levelId',
  'level_label',
  'levelLabel',
  'level_description',
  'levelDescription',
  'turns',
  'client_ip',
];

const ALL_STUDENT_RESULT_FORBIDDEN_KEYS = [
  ...STUDENT_FORBIDDEN_KEYS,
  ...ADDITIONAL_FORBIDDEN_KEYS,
];

function toIso(value) {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function assertStudentResultSafe(obj) {
  const forbidden = new Set(ALL_STUDENT_RESULT_FORBIDDEN_KEYS);
  const stack = [{ value: obj, path: '$' }];
  while (stack.length > 0) {
    const { value, path } = stack.pop();
    if (!value || typeof value !== 'object') continue;
    for (const [key, child] of Object.entries(value)) {
      if (forbidden.has(key)) {
        const err = new Error(`Student-facing result payload contains forbidden key "${key}" at ${path}.`);
        err.statusCode = 500;
        err.code = 'STUDENT_VIEW_LEAK';
        throw err;
      }
      stack.push({ value: child, path: `${path}.${key}` });
    }
  }
  return obj;
}

function toStudentResultListItem(row) {
  if (!row) return null;
  const item = {
    resultId: row.viva_result_id,
    examSessionId: row.exam_session_id,
    examTitle: row.session_title ?? null,
    subjectCode: row.subject_code ?? null,
    subjectName: row.subject_name ?? null,
    topicName: row.topic_name ?? null,
    finalizedAt: toIso(row.finalized_at),
    totalScore: Number(row.final_total_score != null ? row.final_total_score : row.ai_total_score ?? 0),
  };
  assertStudentResultSafe(item);
  return item;
}

function toStudentResultView(detail) {
  if (!detail || !detail.result) return null;
  const { result, evaluations = [] } = detail;

  const view = {
    resultId: result.viva_result_id,
    examSessionId: result.exam_session_id,
    examTitle: result.session_title ?? null,
    subjectCode: result.subject_code ?? null,
    subjectName: result.subject_name ?? null,
    topicName: result.topic_name ?? null,
    finalizedAt: toIso(result.finalized_at),
    totalScore: Number(result.final_total_score != null ? result.final_total_score : result.ai_total_score ?? 0),
    questions: evaluations.map((ev) => ({
      orderNo: ev.order_no ?? null,
      questionContent: ev.question_content ?? null,
      score: Number(ev.final_score != null ? ev.final_score : ev.ai_score ?? 0),
      criteria: (ev.criteria || []).map((c) => ({
        criterionName: c.criterion_name ?? null,
        score: Number(c.final_score != null ? c.final_score : c.ai_score ?? 0),
        maxScore: Number(c.criterion_max_score != null ? c.criterion_max_score : c.max_score ?? 10),
        weight: Number(c.criterion_weight != null ? c.criterion_weight : c.weight ?? 0),
      })),
    })),
  };

  assertStudentResultSafe(view);
  return view;
}

module.exports = {
  ALL_STUDENT_RESULT_FORBIDDEN_KEYS,
  assertStudentResultSafe,
  toStudentResultListItem,
  toStudentResultView,
};
