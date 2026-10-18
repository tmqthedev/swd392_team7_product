class BackgroundJobRepository {
  constructor(db) {
    this.db = db;
  }

  async enqueue(type, payload, { runAfter, maxAttempts } = {}) {
    const result = await this.db.query(
      `INSERT INTO background_job (type, payload, max_attempts, run_after)
       VALUES ($1, $2, $3, COALESCE($4, now()))
       RETURNING *`,
      [type, JSON.stringify(payload ?? {}), maxAttempts ?? null, runAfter ?? null],
    );
    return result.rows[0];
  }

  async findById(id) {
    const result = await this.db.query(
      'SELECT * FROM background_job WHERE background_job_id = $1',
      [id],
    );
    return result.rows[0] || null;
  }

  /**
   * Atomically claim the next runnable job. The inner SELECT ... FOR UPDATE
   * SKIP LOCKED lets concurrent workers grab distinct rows without blocking.
   * Must be called with a transaction client so the row lock is held for the
   * duration of the claim.
   * @param {{query: Function}} client transaction-scoped query runner
   */
  async claimNext(client) {
    const runner = client || this.db;
    const result = await runner.query(
      `UPDATE background_job
       SET status = 'RUNNING', locked_at = now(), attempts = attempts + 1, updated_at = now()
       WHERE background_job_id = (
         SELECT background_job_id
         FROM background_job
         WHERE status = 'PENDING' AND run_after <= now()
         ORDER BY run_after
         FOR UPDATE SKIP LOCKED
         LIMIT 1
       )
       RETURNING *`,
    );
    return result.rows[0] || null;
  }

  /**
   * Recover jobs a dead worker left RUNNING (claimNext commits the RUNNING flip
   * before the handler starts, so a crash/restart would otherwise strand them).
   * Jobs whose lock is older than `olderThanMs` go back to PENDING, or to FAILED
   * when their attempts are already exhausted.
   * @returns {Promise<object[]>} the recovered rows
   */
  async requeueStale({ olderThanMs, defaultMaxAttempts = 3 } = {}) {
    const result = await this.db.query(
      `UPDATE background_job
       SET status = CASE WHEN attempts >= COALESCE(max_attempts, $2) THEN 'FAILED' ELSE 'PENDING' END,
           last_error = 'Worker stopped before the job finished',
           locked_at = NULL,
           run_after = now(),
           updated_at = now()
       WHERE status = 'RUNNING'
         AND locked_at < now() - ($1::bigint * interval '1 millisecond')
       RETURNING *`,
      [olderThanMs, defaultMaxAttempts],
    );
    return result.rows;
  }

  async markDone(id) {
    const result = await this.db.query(
      `UPDATE background_job
       SET status = 'DONE', locked_at = NULL, updated_at = now()
       WHERE background_job_id = $1
       RETURNING *`,
      [id],
    );
    return result.rows[0] || null;
  }

  /**
   * Mark a job failed. When nextRunAfter is provided the job is re-queued as
   * PENDING (retry); otherwise it stays FAILED (exhausted attempts).
   */
  async markFailed(id, errorText, nextRunAfter = null) {
    const result = await this.db.query(
      `UPDATE background_job
       SET status = CASE WHEN $3::timestamptz IS NULL THEN 'FAILED' ELSE 'PENDING' END,
           last_error = $2,
           locked_at = NULL,
           run_after = COALESCE($3::timestamptz, run_after),
           updated_at = now()
       WHERE background_job_id = $1
       RETURNING *`,
      [id, errorText ?? null, nextRunAfter ?? null],
    );
    return result.rows[0] || null;
  }
}

module.exports = { BackgroundJobRepository };
