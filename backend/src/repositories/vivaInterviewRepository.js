class VivaInterviewRepository {
  constructor(db) {
    this.db = db;
  }

  async create({ examSessionId, studentId, status, deadlineAt, clientIp }) {
    const result = await this.db.query(
      `INSERT INTO viva_interview
         (exam_session_id, student_id, status, deadline_at, client_ip)
       VALUES ($1, $2, COALESCE($3, 'NOT_STARTED'), $4, $5)
       RETURNING *`,
      [examSessionId, studentId, status ?? null, deadlineAt ?? null, clientIp ?? null],
    );
    return result.rows[0];
  }

  async findById(id) {
    const result = await this.db.query('SELECT * FROM viva_interview WHERE viva_interview_id = $1', [id]);
    return result.rows[0] || null;
  }

  async findByExamAndStudent(examSessionId, studentId) {
    const result = await this.db.query(
      'SELECT * FROM viva_interview WHERE exam_session_id = $1 AND student_id = $2',
      [examSessionId, studentId],
    );
    return result.rows[0] || null;
  }

  async updateProgress(id, patch) {
    const sets = [];
    const values = [];
    let idx = 1;
    for (const [key, val] of Object.entries(patch)) {
      if (!VivaInterviewRepository.UPDATABLE_COLUMNS.includes(key) || val === undefined) continue;
      sets.push(`${key} = $${idx++}`);
      values.push(val);
    }
    if (sets.length === 0) return this.findById(id);
    values.push(id);
    const result = await this.db.query(
      `UPDATE viva_interview SET ${sets.join(', ')} WHERE viva_interview_id = $${idx} RETURNING *`,
      values,
    );
    return result.rows[0] || null;
  }

  async setStatus(id, status) {
    const result = await this.db.query(
      'UPDATE viva_interview SET status = $1 WHERE viva_interview_id = $2 RETURNING *',
      [status, id],
    );
    return result.rows[0] || null;
  }
}

VivaInterviewRepository.UPDATABLE_COLUMNS = [
  'current_question_index',
  'current_follow_up_count',
  'started_at',
  'deadline_at',
  'ended_at',
  'end_reason',
];

module.exports = { VivaInterviewRepository };
