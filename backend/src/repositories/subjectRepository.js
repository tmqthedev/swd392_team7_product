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
}

module.exports = { SubjectRepository };
