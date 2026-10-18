// Persistence for assigned_question: the per-student, ordered main questions
// picked when an interview starts (order_no = 1..n).
class AssignedQuestionRepository {
  constructor(db) {
    this.db = db;
  }

  async createMany(interviewId, questionIds, client = this.db) {
    const rows = [];
    for (let i = 0; i < questionIds.length; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const result = await client.query(
        `INSERT INTO assigned_question (interview_id, question_id, order_no)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [interviewId, questionIds[i], i + 1],
      );
      rows.push(result.rows[0]);
    }
    return rows;
  }

  async listByInterview(interviewId, client = this.db) {
    const result = await client.query(
      'SELECT * FROM assigned_question WHERE interview_id = $1 ORDER BY order_no',
      [interviewId],
    );
    return result.rows;
  }

  async markAsked(id, client = this.db) {
    const result = await client.query(
      'UPDATE assigned_question SET is_asked = true WHERE assigned_question_id = $1 RETURNING *',
      [id],
    );
    return result.rows[0] || null;
  }
}

module.exports = { AssignedQuestionRepository };
