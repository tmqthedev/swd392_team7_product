// Persistence for transcript: one row per interview (unique index, migration
// 016). upsert keeps the latest full text and completion flag.
class TranscriptRepository {
  constructor(db) {
    this.db = db;
  }

  async upsert({ interviewId, fullText, isComplete }, client = this.db) {
    const result = await client.query(
      `INSERT INTO transcript (interview_id, full_text, is_complete)
       VALUES ($1, $2, $3)
       ON CONFLICT (interview_id) DO UPDATE
         SET full_text = EXCLUDED.full_text, is_complete = EXCLUDED.is_complete
       RETURNING *`,
      [interviewId, fullText ?? null, isComplete === true],
    );
    return result.rows[0];
  }

  async findByInterview(interviewId, client = this.db) {
    const result = await client.query('SELECT * FROM transcript WHERE interview_id = $1', [interviewId]);
    return result.rows[0] || null;
  }
}

module.exports = { TranscriptRepository };
