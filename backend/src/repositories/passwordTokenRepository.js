class PasswordTokenRepository {
  constructor(db) {
    this.db = db;
  }

  async create({ userId, tokenHash, purpose, expiresAt }) {
    const result = await this.db.query(
      `INSERT INTO password_token (user_id, token_hash, purpose, expires_at)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [userId, tokenHash, purpose, expiresAt],
    );
    return result.rows[0];
  }

  async findActiveByHash(hash, purpose) {
    const result = await this.db.query(
      `SELECT * FROM password_token
       WHERE token_hash = $1
         AND purpose = $2
         AND used_at IS NULL
         AND expires_at > now()`,
      [hash, purpose],
    );
    return result.rows[0] || null;
  }

  async markUsed(id) {
    const result = await this.db.query(
      `UPDATE password_token
       SET used_at = now()
       WHERE password_token_id = $1 AND used_at IS NULL
       RETURNING *`,
      [id],
    );
    return result.rows[0] || null;
  }

  async invalidateActiveForUser(userId, purpose) {
    const result = await this.db.query(
      `UPDATE password_token
       SET used_at = now()
       WHERE user_id = $1 AND purpose = $2 AND used_at IS NULL
       RETURNING *`,
      [userId, purpose],
    );
    return result.rows;
  }
}

module.exports = { PasswordTokenRepository };
