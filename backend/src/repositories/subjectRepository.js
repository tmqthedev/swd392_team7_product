class SubjectRepository {
  constructor(db) {
    this.db = db;
  }

  async create({ code, name }) {
    const result = await this.db.query(
      'INSERT INTO subject (code, name) VALUES ($1, $2) RETURNING *',
      [code, name],
    );
    return result.rows[0];
  }

  async findById(id) {
    const result = await this.db.query('SELECT * FROM subject WHERE subject_id = $1', [id]);
    return result.rows[0] || null;
  }

  async list() {
    const result = await this.db.query('SELECT * FROM subject ORDER BY subject_id');
    return result.rows;
  }

  async addLecturer(subjectId, lecturerId) {
    const result = await this.db.query(
      `INSERT INTO subject_lecturer (subject_id, lecturer_id)
       VALUES ($1, $2)
       RETURNING *`,
      [subjectId, lecturerId],
    );
    return result.rows[0];
  }

  async listLecturers(subjectId) {
    const result = await this.db.query(
      `SELECT u.*
       FROM subject_lecturer sl
       JOIN app_user u ON u.app_user_id = sl.lecturer_id
       WHERE sl.subject_id = $1
       ORDER BY u.app_user_id`,
      [subjectId],
    );
    return result.rows;
  }

  async update(id, patch) {
    const sets = [];
    const values = [];
    let idx = 1;
    for (const [key, val] of Object.entries(patch)) {
      if (!SubjectRepository.UPDATABLE_COLUMNS.includes(key) || val === undefined) continue;
      sets.push(`${key} = $${idx++}`);
      values.push(val);
    }
    if (sets.length === 0) return this.findById(id);
    values.push(id);
    const result = await this.db.query(
      `UPDATE subject SET ${sets.join(', ')} WHERE subject_id = $${idx} RETURNING *`,
      values,
    );
    return result.rows[0] || null;
  }

  async remove(id) {
    const result = await this.db.query(
      'DELETE FROM subject WHERE subject_id = $1 RETURNING *',
      [id],
    );
    return result.rows[0] || null;
  }

  /**
   * Replace the full set of lecturers assigned to a subject in a single
   * transaction: clear existing assignments, then insert the given ids.
   */
  async setLecturers(subjectId, lecturerIds) {
    const ids = Array.from(new Set((lecturerIds || []).filter((id) => id != null)));
    return this.db.withTransaction(async (tx) => {
      await tx.query('DELETE FROM subject_lecturer WHERE subject_id = $1', [subjectId]);
      for (const lecturerId of ids) {
        await tx.query(
          `INSERT INTO subject_lecturer (subject_id, lecturer_id)
           VALUES ($1, $2)`,
          [subjectId, lecturerId],
        );
      }
      const result = await tx.query(
        `SELECT lecturer_id FROM subject_lecturer
         WHERE subject_id = $1
         ORDER BY lecturer_id`,
        [subjectId],
      );
      return result.rows.map((row) => row.lecturer_id);
    });
  }

  async listSubjectIdsForLecturer(lecturerId) {
    const result = await this.db.query(
      `SELECT subject_id FROM subject_lecturer
       WHERE lecturer_id = $1
       ORDER BY subject_id`,
      [lecturerId],
    );
    return result.rows.map((row) => row.subject_id);
  }
}

SubjectRepository.UPDATABLE_COLUMNS = ['code', 'name'];

module.exports = { SubjectRepository };
