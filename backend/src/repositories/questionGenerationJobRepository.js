class QuestionGenerationJobRepository {
  constructor(db) {
    this.db = db;
  }

  async create({
    topicId,
    materialIds,
    requestedCount,
    bloomDistribution,
    language,
    status,
    requestedBy,
  }) {
    const result = await this.db.query(
      `INSERT INTO question_generation_job
         (topic_id, material_ids, requested_count, bloom_distribution, language, status, requested_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        topicId ?? null,
        materialIds == null ? null : JSON.stringify(materialIds),
        requestedCount ?? null,
        bloomDistribution == null ? null : JSON.stringify(bloomDistribution),
        language ?? null,
        status ?? null,
        requestedBy ?? null,
      ],
    );
    return result.rows[0];
  }

  async findById(id) {
    const result = await this.db.query(
      'SELECT * FROM question_generation_job WHERE question_generation_job_id = $1',
      [id],
    );
    return result.rows[0] || null;
  }

  async updateStatus(id, status, error = null) {
    const result = await this.db.query(
      `UPDATE question_generation_job
       SET status = $1, error = $2
       WHERE question_generation_job_id = $3
       RETURNING *`,
      [status, error, id],
    );
    return result.rows[0] || null;
  }

  // Absolute write of the survivor count. The generation handler uses this (not
  // incrementGenerated) so a retried run writes the final count idempotently
  // instead of double-counting across attempts.
  async setGeneratedCount(id, n) {
    const result = await this.db.query(
      `UPDATE question_generation_job
       SET generated_count = $1
       WHERE question_generation_job_id = $2
       RETURNING *`,
      [n, id],
    );
    return result.rows[0] || null;
  }

  async incrementGenerated(id, delta = 1) {
    const result = await this.db.query(
      `UPDATE question_generation_job
       SET generated_count = generated_count + $1
       WHERE question_generation_job_id = $2
       RETURNING *`,
      [delta, id],
    );
    return result.rows[0] || null;
  }
}

module.exports = { QuestionGenerationJobRepository };
