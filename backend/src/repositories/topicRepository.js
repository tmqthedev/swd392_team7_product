class TopicRepository {
  constructor(db) {
    this.db = db;
  }
  async create({ name, course_id, subject_id = null }) {
    const result = await this.db.query(
      'INSERT INTO topic (name, course_id, subject_id) VALUES ($1, $2, $3) RETURNING *',
      [name, course_id, subject_id]
    );
    return result.rows[0];
  }
  async getById(id) {
    const result = await this.db.query('SELECT * FROM topic WHERE topic_id = $1', [id]);
    return result.rows[0] || null;
  }
  // Resolve a topic by its course_id "code" (used by the question Excel import).
  async findByCode(code) {
    const result = await this.db.query('SELECT * FROM topic WHERE course_id = $1 LIMIT 1', [code]);
    return result.rows[0] || null;
  }
  async list() {
    const result = await this.db.query('SELECT * FROM topic ORDER BY topic_id');
    return result.rows;
  }
  async listBySubjectId(subjectId) {
    const result = await this.db.query(
      'SELECT * FROM topic WHERE subject_id = $1 ORDER BY topic_id',
      [subjectId]
    );
    return result.rows;
  }
  async listBySubjectIds(subjectIds) {
    if (!subjectIds || subjectIds.length === 0) return [];
    const result = await this.db.query(
      'SELECT * FROM topic WHERE subject_id = ANY($1::int[]) ORDER BY topic_id',
      [subjectIds]
    );
    return result.rows;
  }
  async update(id, patch) {
    const sets = [];
    const values = [];
    let idx = 1;
    for (const [key, val] of Object.entries(patch)) {
      if (!TopicRepository.UPDATABLE_COLUMNS.includes(key) || val === undefined) continue;
      sets.push(`${key} = $${idx++}`);
      values.push(val);
    }
    if (sets.length === 0) return this.getById(id);
    values.push(id);
    const result = await this.db.query(
      `UPDATE topic SET ${sets.join(', ')} WHERE topic_id = $${idx} RETURNING *`,
      values
    );
    return result.rows[0];
  }
  async delete(id) {
    const result = await this.db.query('DELETE FROM topic WHERE topic_id = $1 RETURNING *', [id]);
    return result.rows[0] || null;
  }
}
TopicRepository.UPDATABLE_COLUMNS = ['name', 'course_id', 'subject_id'];
module.exports = { TopicRepository };
