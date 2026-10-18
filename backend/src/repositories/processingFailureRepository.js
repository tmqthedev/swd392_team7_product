// Persistence for processing_failure: provider/LLM failures recorded during an
// interview (STT, TTS, AUDIO_STORE, FOLLOW_UP_LLM, GRADE_ENQUEUE). The
// interview never stops because of one of these; they are kept for review and
// Step 10 retries.
class ProcessingFailureRepository {
  constructor(db) {
    this.db = db;
  }

  async create({
    interviewId, turnId, stage, errorCode, message, retryCount,
  }, client = this.db) {
    const result = await client.query(
      `INSERT INTO processing_failure (interview_id, turn_id, stage, error_code, message, retry_count)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        interviewId,
        turnId ?? null,
        stage ?? null,
        errorCode ?? null,
        message ?? null,
        Number.isInteger(retryCount) ? retryCount : 0,
      ],
    );
    return result.rows[0];
  }

  async listByInterview(interviewId, client = this.db) {
    const result = await client.query(
      'SELECT * FROM processing_failure WHERE interview_id = $1 ORDER BY processing_failure_id',
      [interviewId],
    );
    return result.rows;
  }
}

module.exports = { ProcessingFailureRepository };
