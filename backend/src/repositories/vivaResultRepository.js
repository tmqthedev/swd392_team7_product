// Data access layer for viva_result, question_evaluation, criterion_score,
// and score_adjustment (Step 8: AI Grading & Lecturer Review).

class VivaResultRepository {
  constructor(options = {}) {
    this.db = options && options.db ? options.db : options;
  }

  async findByInterviewId(interviewId, tx) {
    const db = tx || this.db;
    const res = await db.query(
      'SELECT * FROM viva_result WHERE interview_id = $1 LIMIT 1',
      [interviewId]
    );
    return res.rows[0] || null;
  }

  async createPendingIfAbsent(interviewId, tx) {
    const db = tx || this.db;
    const query = `
      INSERT INTO viva_result (interview_id, status)
      VALUES ($1, 'PENDING')
      ON CONFLICT (interview_id) DO UPDATE SET interview_id = EXCLUDED.interview_id
      RETURNING *
    `;
    const res = await db.query(query, [interviewId]);
    return res.rows[0];
  }

  async findById(vivaResultId) {
    const res = await this.db.query(
      'SELECT * FROM viva_result WHERE viva_result_id = $1 LIMIT 1',
      [vivaResultId]
    );
    return res.rows[0] || null;
  }

  async listBySession(examSessionId) {
    const query = `
      SELECT vr.viva_result_id, vr.interview_id, vr.status, vr.ai_total_score, vr.final_total_score,
             vr.finalized_by, vr.finalized_at,
             vi.exam_session_id, vi.student_id, vi.started_at, vi.ended_at,
             u.name AS student_name, u.student_code, u.email AS student_email,
             (SELECT qe.flag_reason FROM question_evaluation qe WHERE qe.result_id = vr.viva_result_id AND qe.flag_reason IS NOT NULL LIMIT 1) AS flag_reason
      FROM viva_result vr
      JOIN viva_interview vi ON vi.viva_interview_id = vr.interview_id
      JOIN app_user u ON u.app_user_id = vi.student_id
      WHERE vi.exam_session_id = $1
      ORDER BY vi.started_at DESC NULLS LAST
    `;
    const res = await this.db.query(query, [examSessionId]);
    return res.rows;
  }

  async updateResult(vivaResultId, fields = {}) {
    const keys = Object.keys(fields);
    if (keys.length === 0) return this.findById(vivaResultId);

    const setClauses = [];
    const values = [];
    keys.forEach((key, idx) => {
      setClauses.push(`${key} = $${idx + 1}`);
      values.push(fields[key]);
    });
    values.push(vivaResultId);

    const query = `
      UPDATE viva_result
      SET ${setClauses.join(', ')}
      WHERE viva_result_id = $${values.length}
      RETURNING *
    `;
    const res = await this.db.query(query, values);
    return res.rows[0] || null;
  }

  async saveEvaluationsAndCriteria(resultId, evaluations = []) {
    return this.db.withTransaction(async (client) => {
      // Clear previous evaluations if regrading
      await client.query('DELETE FROM question_evaluation WHERE result_id = $1', [resultId]);

      const savedEvals = [];
      for (const ev of evaluations) {
        const evalRes = await client.query(
          `INSERT INTO question_evaluation
             (result_id, assigned_question_id, ai_score, final_score, confidence,
              strengths, weaknesses, missing_points, feedback, flag_reason, model_id, prompt_version)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
           RETURNING *`,
          [
            resultId,
            ev.assigned_question_id || ev.assignedQuestionId,
            ev.ai_score,
            ev.final_score ?? ev.ai_score,
            ev.confidence,
            ev.strengths,
            ev.weaknesses,
            JSON.stringify(ev.missing_points || []),
            ev.feedback,
            ev.flag_reason || null,
            ev.model_id || 'apac.amazon.nova-pro-v1:0',
            ev.prompt_version || '1.0',
          ]
        );
        const savedEval = evalRes.rows[0];

        const savedCriteria = [];
        for (const cs of (ev.criteria || [])) {
          const critRes = await client.query(
            `INSERT INTO criterion_score
               (evaluation_id, criterion_id, ai_level_id, ai_score, ai_justification, evidence, final_score)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING *`,
            [
              savedEval.question_evaluation_id,
              cs.criterion_id,
              cs.ai_level_id || null,
              cs.ai_score,
              cs.ai_justification || '',
              JSON.stringify(cs.evidence || []),
              cs.final_score ?? cs.ai_score,
            ]
          );
          savedCriteria.push(critRes.rows[0]);
        }

        savedEval.criteria = savedCriteria;
        savedEvals.push(savedEval);
      }
      return savedEvals;
    });
  }

  async findCriterionScoreById(criterionScoreId) {
    const query = `
      SELECT cs.*, qe.result_id, qe.assigned_question_id, qe.question_evaluation_id
      FROM criterion_score cs
      JOIN question_evaluation qe ON qe.question_evaluation_id = cs.evaluation_id
      WHERE cs.criterion_score_id = $1
      LIMIT 1
    `;
    const res = await this.db.query(query, [criterionScoreId]);
    return res.rows[0] || null;
  }

  async updateCriterionScore(criterionScoreId, { finalScore }) {
    const res = await this.db.query(
      `UPDATE criterion_score
       SET final_score = $1
       WHERE criterion_score_id = $2
       RETURNING *`,
      [finalScore, criterionScoreId]
    );
    return res.rows[0] || null;
  }

  async updateEvaluationScore(questionEvaluationId, { finalScore }) {
    const res = await this.db.query(
      `UPDATE question_evaluation
       SET final_score = $1
       WHERE question_evaluation_id = $2
       RETURNING *`,
      [finalScore, questionEvaluationId]
    );
    return res.rows[0] || null;
  }

  async insertScoreAdjustment({ criterionScoreId, oldScore, newScore, reason, adjustedBy }) {
    const res = await this.db.query(
      `INSERT INTO score_adjustment
         (criterion_score_id, old_score, new_score, reason, adjusted_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [criterionScoreId, oldScore, newScore, reason, adjustedBy]
    );
    return res.rows[0] || null;
  }

  async getFullResultDetail(vivaResultId) {
    const resultRes = await this.db.query(
      `SELECT vr.*,
              vi.exam_session_id, vi.student_id, vi.started_at, vi.ended_at, vi.status AS interview_status,
              u.name AS student_name, u.student_code, u.email AS student_email,
              es.title AS session_title, es.subject_id, es.topic_id, es.language AS exam_language,
              s.name AS subject_name,
              t.name AS topic_name,
              examiner.name AS finalized_by_name
       FROM viva_result vr
       JOIN viva_interview vi ON vi.viva_interview_id = vr.interview_id
       JOIN app_user u ON u.app_user_id = vi.student_id
       JOIN exam_session es ON es.exam_session_id = vi.exam_session_id
       LEFT JOIN subject s ON s.subject_id = es.subject_id
       LEFT JOIN topic t ON t.topic_id = es.topic_id
       LEFT JOIN app_user examiner ON examiner.app_user_id = vr.finalized_by
       WHERE vr.viva_result_id = $1
       LIMIT 1`,
      [vivaResultId]
    );
    const result = resultRes.rows[0];
    if (!result) return null;

    // Load question evaluations
    const evalsRes = await this.db.query(
      `SELECT qe.*,
              aq.order_no, aq.question_id,
              q.content AS question_content, q.bloom_level, q.reference_answer, q.key_points,
              q.rationale AS question_rationale
       FROM question_evaluation qe
       LEFT JOIN assigned_question aq ON aq.assigned_question_id = qe.assigned_question_id
       LEFT JOIN question q ON q.question_id = aq.question_id
       WHERE qe.result_id = $1
       ORDER BY aq.order_no ASC NULLS LAST`,
      [vivaResultId]
    );
    const evaluations = evalsRes.rows;

    // Load criteria for each evaluation
    for (const ev of evaluations) {
      const critRes = await this.db.query(
        `SELECT cs.*,
                rc.name AS criterion_name, rc.weight AS criterion_weight, rc.max_score AS criterion_max_score,
                pl.label AS level_label, pl.description AS level_description
         FROM criterion_score cs
         JOIN rubric_criterion rc ON rc.rubric_criterion_id = cs.criterion_id
         LEFT JOIN performance_level pl ON pl.performance_level_id = cs.ai_level_id
         WHERE cs.evaluation_id = $1
         ORDER BY rc.order_index ASC, rc.rubric_criterion_id ASC`,
        [ev.question_evaluation_id]
      );
      ev.criteria = critRes.rows;

      // Load turns for this assigned question
      const turnsRes = await this.db.query(
        `SELECT qt.*
         FROM qa_turn qt
         WHERE qt.interview_id = $1 AND qt.assigned_question_id = $2
         ORDER BY qt.sequence_no ASC`,
        [result.interview_id, ev.assigned_question_id]
      );
      ev.turns = turnsRes.rows;
    }

    // Load adjustments history
    const adjRes = await this.db.query(
      `SELECT sa.*, cs.criterion_id, rc.name AS criterion_name, u.name AS adjusted_by_name
       FROM score_adjustment sa
       JOIN criterion_score cs ON cs.criterion_score_id = sa.criterion_score_id
       JOIN question_evaluation qe ON qe.question_evaluation_id = cs.evaluation_id
       JOIN rubric_criterion rc ON rc.rubric_criterion_id = cs.criterion_id
       LEFT JOIN app_user u ON u.app_user_id = sa.adjusted_by
       WHERE qe.result_id = $1
       ORDER BY sa.adjusted_at DESC`,
      [vivaResultId]
    );

    return {
      result,
      evaluations,
      scoreAdjustments: adjRes.rows,
    };
  }

  async isExaminerOrCreator(examSessionId, userId, tx) {
    const db = tx || this.db;
    const query = `
      SELECT 1 FROM exam_session es
      WHERE es.exam_session_id = $1
        AND (
          es.created_by = $2
          OR EXISTS (
            SELECT 1 FROM exam_session_examiner ese
            WHERE ese.exam_session_id = es.exam_session_id AND ese.lecturer_id = $2
          )
        )
      LIMIT 1
    `;
    const res = await db.query(query, [examSessionId, userId]);
    return res.rows.length > 0;
  }

  async listFinalizedForStudent(studentId, tx) {
    const db = tx || this.db;
    const query = `
      SELECT vr.viva_result_id, vr.interview_id, vr.status, vr.ai_total_score, vr.final_total_score,
             vr.finalized_at,
             vi.exam_session_id, vi.student_id,
             es.title AS session_title,
             s.subject_id, s.code AS subject_code, s.name AS subject_name,
             t.topic_id, t.name AS topic_name
      FROM viva_result vr
      JOIN viva_interview vi ON vi.viva_interview_id = vr.interview_id
      JOIN exam_session es ON es.exam_session_id = vi.exam_session_id
      LEFT JOIN subject s ON s.subject_id = es.subject_id
      LEFT JOIN topic t ON t.topic_id = es.topic_id
      WHERE vi.student_id = $1
        AND vr.status = 'FINALIZED'
      ORDER BY vr.finalized_at DESC NULLS LAST, vr.viva_result_id DESC
    `;
    const res = await db.query(query, [studentId]);
    return res.rows;
  }

  async findFinalizedForStudent(vivaResultId, studentId, tx) {
    const db = tx || this.db;
    const resultRes = await db.query(
      `SELECT vr.viva_result_id, vr.interview_id, vr.status, vr.ai_total_score, vr.final_total_score,
              vr.finalized_at,
              vi.exam_session_id, vi.student_id,
              es.title AS session_title,
              s.subject_id, s.code AS subject_code, s.name AS subject_name,
              t.topic_id, t.name AS topic_name
       FROM viva_result vr
       JOIN viva_interview vi ON vi.viva_interview_id = vr.interview_id
       JOIN exam_session es ON es.exam_session_id = vi.exam_session_id
       LEFT JOIN subject s ON s.subject_id = es.subject_id
       LEFT JOIN topic t ON t.topic_id = es.topic_id
       WHERE vr.viva_result_id = $1
         AND vi.student_id = $2
         AND vr.status = 'FINALIZED'
       LIMIT 1`,
      [vivaResultId, studentId]
    );
    const result = resultRes.rows[0];
    if (!result) return null;

    // Load question evaluations
    const evalsRes = await db.query(
      `SELECT qe.question_evaluation_id, qe.ai_score, qe.final_score,
              aq.order_no,
              q.content AS question_content
       FROM question_evaluation qe
       LEFT JOIN assigned_question aq ON aq.assigned_question_id = qe.assigned_question_id
       LEFT JOIN question q ON q.question_id = aq.question_id
       WHERE qe.result_id = $1
       ORDER BY aq.order_no ASC NULLS LAST`,
      [vivaResultId]
    );
    const evaluations = evalsRes.rows;

    for (const ev of evaluations) {
      const critRes = await db.query(
        `SELECT cs.criterion_score_id, cs.ai_score, cs.final_score,
                rc.name AS criterion_name, rc.weight AS criterion_weight, rc.max_score AS criterion_max_score
         FROM criterion_score cs
         JOIN rubric_criterion rc ON rc.rubric_criterion_id = cs.criterion_id
         WHERE cs.evaluation_id = $1
         ORDER BY rc.order_index ASC, rc.rubric_criterion_id ASC`,
        [ev.question_evaluation_id]
      );
      ev.criteria = critRes.rows;
    }

    return {
      result,
      evaluations,
    };
  }
}

module.exports = {
  VivaResultRepository,
};
