class AppUserRepository {
  constructor(db) {
    this.db = db;
  }

  async create({ code, email, fullName, passwordHash, role, status }) {
    const result = await this.db.query(
      `INSERT INTO app_user (code, email, full_name, password_hash, role, status)
       VALUES ($1, $2, $3, $4, $5, COALESCE($6, 'ACTIVE'))
       RETURNING *`,
      [code ?? null, email, fullName ?? null, passwordHash ?? null, role, status ?? null],
    );
    return result.rows[0];
  }

  async findById(id) {
    const result = await this.db.query('SELECT * FROM app_user WHERE app_user_id = $1', [id]);
    return result.rows[0] || null;
  }

  async findByEmail(email) {
    const result = await this.db.query('SELECT * FROM app_user WHERE email = $1', [email]);
    return result.rows[0] || null;
  }

  async findByCode(code) {
    const result = await this.db.query('SELECT * FROM app_user WHERE code = $1', [code]);
    return result.rows[0] || null;
  }

  async updateLoginState(id, patch) {
    const sets = [];
    const values = [];
    let idx = 1;
    for (const [key, val] of Object.entries(patch)) {
      if (!AppUserRepository.UPDATABLE_COLUMNS.includes(key) || val === undefined) continue;
      sets.push(`${key} = $${idx++}`);
      values.push(val);
    }
    if (sets.length === 0) return this.findById(id);
    values.push(id);
    const result = await this.db.query(
      `UPDATE app_user SET ${sets.join(', ')} WHERE app_user_id = $${idx} RETURNING *`,
      values,
    );
    return result.rows[0] || null;
  }

  async setStatus(id, status) {
    const result = await this.db.query(
      'UPDATE app_user SET status = $1 WHERE app_user_id = $2 RETURNING *',
      [status, id],
    );
    return result.rows[0] || null;
  }
}

AppUserRepository.UPDATABLE_COLUMNS = [
  'failed_login_count',
  'locked_until',
  'last_login_at',
  'status',
  'password_hash',
];

module.exports = { AppUserRepository };
