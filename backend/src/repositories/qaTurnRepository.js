class QaTurnRepository {
  constructor(db) {
    this.db = db;
  }

  async create({
    interviewId,
    assignedQuestionId,
    sequenceNo,
    turnType,
    followUpReason,
    questionText,
    rationale,
    status,
  }) {
    const result = await this.db.query(
      `INSERT INTO qa_turn
         (interview_id, assigned_question_id, sequence_no, turn_type, follow_up_reason,
          question_text, rationale, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        interviewId,
        assignedQuestionId ?? null,
        sequenceNo ?? null,
        turnType ?? null,
        followUpReason ?? null,
        questionText ?? null,
        rationale == null ? null : JSON.stringify(rationale),
        status ?? null,
      ],
    );
    return result.rows[0];
  }

  async listByInterview(interviewId) {
    const result = await this.db.query(
      'SELECT * FROM qa_turn WHERE interview_id = $1 ORDER BY sequence_no',
      [interviewId],
    );
    return result.rows;
  }

  async update(id, patch) {
    const sets = [];
    const values = [];
    let idx = 1;
    for (const [key, val] of Object.entries(patch)) {
      if (!QaTurnRepository.UPDATABLE_COLUMNS.includes(key) || val === undefined) continue;
      sets.push(`${key} = $${idx++}`);
      values.push(val);
    }
    if (sets.length === 0) {
      const current = await this.db.query('SELECT * FROM qa_turn WHERE qa_turn_id = $1', [id]);
      return current.rows[0] || null;
    }
    values.push(id);
    const result = await this.db.query(
      `UPDATE qa_turn SET ${sets.join(', ')} WHERE qa_turn_id = $${idx} RETURNING *`,
      values,
    );
    return result.rows[0] || null;
  }
}

QaTurnRepository.UPDATABLE_COLUMNS = [
  'answer_text',
  'answer_audio_key',
  'transcript_confidence',
  'asked_at',
  'answer_started_at',
  'answer_ended_at',
  'timed_out',
  'status',
  'response_latency_ms',
  'speech_duration_ms',
  'words_per_minute',
  'pause_count',
];

module.exports = { QaTurnRepository };
