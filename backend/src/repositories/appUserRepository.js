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
    const result = await this.db.query('SELECT * FROM app_user WHERE LOWER(email) = LOWER($1)', [email]);
    return result.rows[0] || null;
  }

  async findByCode(code) {
    const result = await this.db.query('SELECT * FROM app_user WHERE code = $1', [code]);
    return result.rows[0] || null;
  }

  async findByEmailOrCode(identifier) {
    const result = await this.db.query(
      'SELECT * FROM app_user WHERE email = $1 OR code = $1',
      [identifier],
    );
    return result.rows[0] || null;
  }

  // Soft-deleted users are left out unless includeDeleted is set.
  async list({ role, includeDeleted = false } = {}) {
    const where = [];
    const values = [];
    if (role) { values.push(role); where.push(`role = $${values.length}`); }
    if (!includeDeleted) where.push("status <> 'DELETED'");
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const result = await this.db.query(`SELECT * FROM app_user ${whereSql} ORDER BY app_user_id`, values);
    return result.rows;
  }

  async countActiveAdmins() {
    const result = await this.db.query(
      "SELECT COUNT(*)::int AS count FROM app_user WHERE role = 'ADMIN' AND status = 'ACTIVE'",
    );
    return result.rows[0] ? Number(result.rows[0].count) : 0;
  }

  // SCHEDULED/OPEN exams the user examines or sits; these block a role change
  // or a delete.
  async listOpenExamInvolvement(userId) {
    const result = await this.db.query(
      `SELECT es.exam_session_id, es.title, es.status, 'EXAMINER' AS involvement
         FROM exam_session_examiner x
         JOIN exam_session es ON es.exam_session_id = x.exam_session_id
        WHERE x.lecturer_id = $1 AND es.status IN ('SCHEDULED', 'OPEN')
       UNION ALL
       SELECT es.exam_session_id, es.title, es.status, 'CANDIDATE' AS involvement
         FROM exam_session_student st
         JOIN exam_session es ON es.exam_session_id = st.exam_session_id
        WHERE st.student_id = $1 AND es.status IN ('SCHEDULED', 'OPEN')
       ORDER BY exam_session_id`,
      [userId],
    );
    return result.rows;
  }

  // Subject assignments belong to a role; drop them when the role changes.
  async clearSubjectAssignments(userId) {
    await this.db.query('DELETE FROM subject_lecturer WHERE lecturer_id = $1', [userId]);
    await this.db.query('DELETE FROM subject_student WHERE student_id = $1', [userId]);
  }

  async countByRole(role) {
    const result = await this.db.query(
      'SELECT COUNT(*)::int AS count FROM app_user WHERE role = $1',
      [role],
    );
    return result.rows[0] ? Number(result.rows[0].count) : 0;
  }

  async update(id, patch) {
    const sets = [];
    const values = [];
    let idx = 1;
    for (const [key, val] of Object.entries(patch)) {
      if (!AppUserRepository.UPDATABLE_COLUMNS.includes(key) || val === undefined) continue;
      sets.push(`${key} = $${idx++}`);
      values.push(val);
    }
    if (sets.length === 0) return this.findById(id);
    sets.push('updated_at = now()');
    values.push(id);
    const result = await this.db.query(
      `UPDATE app_user SET ${sets.join(', ')} WHERE app_user_id = $${idx} RETURNING *`,
      values,
    );
    return result.rows[0] || null;
  }

  /**
   * Record one failed login ATOMICALLY (a single UPDATE), so parallel wrong
   * guesses each advance the counter instead of racing on a stale read. The
   * counter restarts when the window anchor (first_failed_at) is older than
   * `windowMs`, and the account locks once it reaches `maxFailures`.
   * `now` is passed in so the service clock stays authoritative (and testable).
   * @returns {Promise<object|null>} the updated row
   */
  async registerLoginFailure(id, {
    now, windowMs, maxFailures, lockMs,
  }) {
    const windowExpired = `(first_failed_at IS NULL
        OR first_failed_at < $2::timestamptz - ($3::bigint * interval '1 millisecond'))`;
    const nextCount = `(CASE WHEN ${windowExpired} THEN 1 ELSE failed_login_count + 1 END)`;
    const result = await this.db.query(
      `UPDATE app_user SET
         failed_login_count = ${nextCount},
         first_failed_at = CASE WHEN ${windowExpired} THEN $2::timestamptz ELSE first_failed_at END,
         locked_until = CASE WHEN ${nextCount} >= $4
           THEN $2::timestamptz + ($5::bigint * interval '1 millisecond')
           ELSE locked_until END
       WHERE app_user_id = $1
       RETURNING *`,
      [id, now, windowMs, maxFailures, lockMs],
    );
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
  'first_failed_at',
  'locked_until',
  'last_login_at',
  'status',
  'password_hash',
  'must_change_password',
  'full_name',
  'email',
  'code',
  'role',
];

module.exports = { AppUserRepository };
