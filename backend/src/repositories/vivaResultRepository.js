class VivaResultRepository {
  constructor(db) {
    this.db = db;
  }

  async create({ interviewId, status, aiTotalScore }) {
    const result = await this.db.query(
      `INSERT INTO viva_result (interview_id, status, ai_total_score)
       VALUES ($1, COALESCE($2, 'PENDING'), $3)
       RETURNING *`,
      [interviewId, status ?? null, aiTotalScore ?? null],
    );
    return result.rows[0];
  }

  // Minimal grading hook (Step 6): ensure a PENDING result exists for a
  // completed interview. Idempotent via the UNIQUE(interview_id) constraint.
  async createPendingIfAbsent(interviewId, client = this.db) {
    const inserted = await client.query(
      `INSERT INTO viva_result (interview_id, status)
       VALUES ($1, 'PENDING')
       ON CONFLICT (interview_id) DO NOTHING
       RETURNING *`,
      [interviewId],
    );
    if (inserted.rows[0]) return inserted.rows[0];
    const existing = await client.query('SELECT * FROM viva_result WHERE interview_id = $1', [interviewId]);
    return existing.rows[0] || null;
  }

  async findByInterview(interviewId) {
    const result = await this.db.query(
      'SELECT * FROM viva_result WHERE interview_id = $1',
      [interviewId],
    );
    return result.rows[0] || null;
  }

  async setStatus(id, status) {
    const result = await this.db.query(
      'UPDATE viva_result SET status = $1 WHERE viva_result_id = $2 RETURNING *',
      [status, id],
    );
    return result.rows[0] || null;
  }

  async finalize(id, { finalTotalScore, finalizedBy }) {
    const result = await this.db.query(
      `UPDATE viva_result
       SET status = 'FINALIZED', final_total_score = $1, finalized_by = $2, finalized_at = now()
       WHERE viva_result_id = $3
       RETURNING *`,
      [finalTotalScore ?? null, finalizedBy ?? null, id],
    );
    return result.rows[0] || null;
  }
}

module.exports = { VivaResultRepository };
