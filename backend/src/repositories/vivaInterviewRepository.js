// Persistence for viva_interview. Methods used inside the engine's
// transactions take an optional trailing `client` (defaults to this.db).
class VivaInterviewRepository {
  constructor(db) {
    this.db = db;
  }

  async create({
    examSessionId, studentId, status, startedAt, deadlineAt, clientIp,
  }, client = this.db) {
    const result = await client.query(
      `INSERT INTO viva_interview
         (exam_session_id, student_id, status, started_at, deadline_at, client_ip)
       VALUES ($1, $2, COALESCE($3, 'NOT_STARTED'), $4, $5, $6)
       RETURNING *`,
      [
        examSessionId,
        studentId,
        status ?? null,
        startedAt ?? null,
        deadlineAt ?? null,
        clientIp ?? null,
      ],
    );
    return result.rows[0];
  }

  async findById(id, client = this.db) {
    const result = await client.query('SELECT * FROM viva_interview WHERE viva_interview_id = $1', [id]);
    return result.rows[0] || null;
  }

  async findByExamAndStudent(examSessionId, studentId, client = this.db) {
    const result = await client.query(
      'SELECT * FROM viva_interview WHERE exam_session_id = $1 AND student_id = $2',
      [examSessionId, studentId],
    );
    return result.rows[0] || null;
  }

  async updateProgress(id, patch, client = this.db) {
    const sets = [];
    const values = [];
    let idx = 1;
    for (const [key, val] of Object.entries(patch)) {
      if (!VivaInterviewRepository.UPDATABLE_COLUMNS.includes(key) || val === undefined) continue;
      sets.push(`${key} = $${idx++}`);
      values.push(val);
    }
    if (sets.length === 0) return this.findById(id, client);
    values.push(id);
    const result = await client.query(
      `UPDATE viva_interview SET ${sets.join(', ')} WHERE viva_interview_id = $${idx} RETURNING *`,
      values,
    );
    return result.rows[0] || null;
  }

  async setStatus(id, status, client = this.db) {
    const result = await client.query(
      'UPDATE viva_interview SET status = $1 WHERE viva_interview_id = $2 RETURNING *',
      [status, id],
    );
    return result.rows[0] || null;
  }

  // Idempotent completion: only an active interview flips to COMPLETED.
  // Returns null when it had already ended, so callers skip side effects.
  // Active interviews whose deadline has passed (F9 background sweep).
  async listOverdueActive({ before, limit = 50 } = {}, client = this.db) {
    const cutoff = before instanceof Date
      ? before.toISOString()
      : (before ? new Date(before).toISOString() : new Date().toISOString());
    const lim = Number.isInteger(limit) && limit > 0 ? limit : 50;
    const result = await client.query(
      `SELECT * FROM viva_interview
        WHERE status IN ('IN_PROGRESS', 'PAUSED')
          AND deadline_at < $1
        ORDER BY deadline_at ASC
        LIMIT $2`,
      [cutoff, lim],
    );
    return result.rows;
  }

  async completeIfActive(id, { endedAt, endReason }, client = this.db) {
    const result = await client.query(
      `UPDATE viva_interview
          SET status = 'COMPLETED', ended_at = $2, end_reason = $3
        WHERE viva_interview_id = $1 AND status IN ('IN_PROGRESS', 'PAUSED')
        RETURNING *`,
      [id, endedAt, endReason ?? null],
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
  'paused_at',
];

module.exports = { VivaInterviewRepository };
