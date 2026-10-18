class AuthSessionRepository {
  constructor(db) {
    this.db = db;
  }

  async create({ userId, refreshTokenHash, expiresAt, ip, userAgent }) {
    const result = await this.db.query(
      `INSERT INTO auth_session (user_id, refresh_token_hash, expires_at, ip, user_agent)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [userId, refreshTokenHash, expiresAt, ip ?? null, userAgent ?? null],
    );
    return result.rows[0];
  }

  async findActiveByHash(refreshTokenHash) {
    const result = await this.db.query(
      `SELECT * FROM auth_session
       WHERE refresh_token_hash = $1
         AND revoked_at IS NULL
         AND expires_at > now()`,
      [refreshTokenHash],
    );
    return result.rows[0] || null;
  }

  async revoke(refreshTokenHash) {
    const result = await this.db.query(
      `UPDATE auth_session
       SET revoked_at = now()
       WHERE refresh_token_hash = $1 AND revoked_at IS NULL
       RETURNING *`,
      [refreshTokenHash],
    );
    return result.rows[0] || null;
  }

  async revokeAllForUser(userId, { exceptHash } = {}) {
    if (exceptHash) {
      const result = await this.db.query(
        `UPDATE auth_session
         SET revoked_at = now()
         WHERE user_id = $1 AND revoked_at IS NULL AND refresh_token_hash <> $2
         RETURNING *`,
        [userId, exceptHash],
      );
      return result.rows;
    }
    const result = await this.db.query(
      `UPDATE auth_session
       SET revoked_at = now()
       WHERE user_id = $1 AND revoked_at IS NULL
       RETURNING *`,
      [userId],
    );
    return result.rows;
  }
}

module.exports = { AuthSessionRepository };
