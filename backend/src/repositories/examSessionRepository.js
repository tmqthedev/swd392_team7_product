class ExamSessionRepository {
  constructor(db) {
    this.db = db;
  }

  async create({
    subjectId,
    topicId,
    title,
    language,
    mainQuestionCount,
    maxFollowUpsPerQuestion,
    answerTimeLimitSec,
    thinkTimeSec,
    opensAt,
    closesAt,
    status,
    createdBy,
  }) {
    const result = await this.db.query(
      `INSERT INTO exam_session
         (subject_id, topic_id, title, language, main_question_count, max_follow_ups_per_question,
          answer_time_limit_sec, think_time_sec, opens_at, closes_at, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, COALESCE($11, 'DRAFT'), $12)
       RETURNING *`,
      [
        subjectId ?? null,
        topicId ?? null,
        title ?? null,
        language ?? null,
        mainQuestionCount ?? null,
        maxFollowUpsPerQuestion ?? null,
        answerTimeLimitSec ?? null,
        thinkTimeSec ?? null,
        opensAt ?? null,
        closesAt ?? null,
        status ?? null,
        createdBy ?? null,
      ],
    );
    return result.rows[0];
  }

  async findById(id) {
    const result = await this.db.query('SELECT * FROM exam_session WHERE exam_session_id = $1', [id]);
    return result.rows[0] || null;
  }

  async list() {
    const result = await this.db.query('SELECT * FROM exam_session ORDER BY exam_session_id');
    return result.rows;
  }

  async addStudent(examSessionId, studentId) {
    const result = await this.db.query(
      `INSERT INTO exam_session_student (exam_session_id, student_id)
       VALUES ($1, $2)
       RETURNING *`,
      [examSessionId, studentId],
    );
    return result.rows[0];
  }

  async addExaminer(examSessionId, lecturerId) {
    const result = await this.db.query(
      `INSERT INTO exam_session_examiner (exam_session_id, lecturer_id)
       VALUES ($1, $2)
       RETURNING *`,
      [examSessionId, lecturerId],
    );
    return result.rows[0];
  }

  async setStatus(id, status) {
    const result = await this.db.query(
      'UPDATE exam_session SET status = $1 WHERE exam_session_id = $2 RETURNING *',
      [status, id],
    );
    return result.rows[0] || null;
  }
}

module.exports = { ExamSessionRepository };
