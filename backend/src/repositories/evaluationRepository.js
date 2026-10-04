class EvaluationRepository {
  constructor(db) {
    this.db = db;
  }
  async create({ session_id, student_id, question_id, ai_suggested_score, ai_feedback, final_score, lecturer_feedback, status }) {
    const result = await this.db.query(
      'INSERT INTO evaluation (session_id, student_id, question_id, ai_suggested_score, ai_feedback, final_score, lecturer_feedback, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
      [session_id, student_id, question_id, ai_suggested_score, ai_feedback, final_score, lecturer_feedback, status]
    );
    return result.rows[0];
  }
  async getById(id) {
    const result = await this.db.query('SELECT * FROM evaluation WHERE evaluation_id = $1', [id]);
    return result.rows[0] || null;
  }
  async list() {
    const result = await this.db.query('SELECT * FROM evaluation ORDER BY evaluation_id');
    return result.rows;
  }
  async update(id, patch) {
    const sets = [];
    const values = [];
    let idx = 1;
    for (const [key, val] of Object.entries(patch)) {
      sets.push(`${key} = $${idx++}`);
      values.push(val);
    }
    if (sets.length === 0) return this.getById(id);
    values.push(id);
    const result = await this.db.query(
      `UPDATE evaluation SET ${sets.join(', ')} WHERE evaluation_id = $${idx} RETURNING *`,
      values
    );
    return result.rows[0];
  }
  async delete(id) {
    const result = await this.db.query('DELETE FROM evaluation WHERE evaluation_id = $1 RETURNING *', [id]);
    return result.rows[0] || null;
  }
}
module.exports = { EvaluationRepository };
