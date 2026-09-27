class QuestionRepository {
  constructor(database) {
    this.db = database;
  }

  async findAll() {
    const result = await this.db.query('SELECT * FROM question ORDER BY question_id ASC');
    return result.rows;
  }

  async findById(questionId) {
    const result = await this.db.query('SELECT * FROM question WHERE question_id = $1', [questionId]);
    return result.rows[0] || null;
  }

  async findByNormalizedContent(normalizedContent, excludeQuestionId = null) {
    const result = await this.db.query(
      `SELECT question_id FROM question
       WHERE LOWER(TRIM(content)) = $1
         AND ($2::int IS NULL OR question_id <> $2)
       LIMIT 1`,
      [normalizedContent, excludeQuestionId],
    );
    return result.rows[0] || null;
  }

  async create({ topicId, rubricId, content, status }) {
    const result = await this.db.query(
      `INSERT INTO question (topic_id, rubric_id, content, status)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [topicId, rubricId ?? null, content, status],
    );
    return result.rows[0];
  }

  async update(questionId, { topicId, rubricId, content, status }) {
    const fields = [];
    const values = [];

    if (topicId !== undefined) {
      values.push(topicId);
      fields.push(`topic_id = $${values.length}`);
    }
    if (rubricId !== undefined) {
      values.push(rubricId);
      fields.push(`rubric_id = $${values.length}`);
    }
    if (content !== undefined) {
      values.push(content);
      fields.push(`content = $${values.length}`);
    }
    if (status !== undefined) {
      values.push(status);
      fields.push(`status = $${values.length}`);
    }

    if (fields.length === 0) {
      return this.findById(questionId);
    }

    values.push(questionId);
    const result = await this.db.query(
      `UPDATE question SET ${fields.join(', ')}
       WHERE question_id = $${values.length}
       RETURNING *`,
      values,
    );
    return result.rows[0] || null;
  }

  async deleteById(questionId) {
    const result = await this.db.query(
      'DELETE FROM question WHERE question_id = $1 RETURNING *',
      [questionId],
    );
    return result.rows[0] || null;
  }
}

module.exports = {
  QuestionRepository,
};
