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
    sessionTimeLimitSec,
  }) {
    // session_time_limit_sec (migration 016) falls back to the column default
    // (1800 s) when the caller omits it.
    const result = await this.db.query(
      `INSERT INTO exam_session
         (subject_id, topic_id, title, language, main_question_count, max_follow_ups_per_question,
          answer_time_limit_sec, think_time_sec, opens_at, closes_at, status, created_by,
          session_time_limit_sec)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, COALESCE($11, 'DRAFT'), $12,
               COALESCE($13, 1800))
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
        sessionTimeLimitSec ?? null,
      ],
    );
    return result.rows[0];
  }

  // Roster membership check used by the interview engine before a student
  // may start an interview.
  async isStudentOnRoster(examSessionId, studentId) {
    const result = await this.db.query(
      'SELECT 1 FROM exam_session_student WHERE exam_session_id = $1 AND student_id = $2',
      [examSessionId, studentId],
    );
    return result.rows.length > 0;
  }

  async findById(id) {
    const result = await this.db.query('SELECT * FROM exam_session WHERE exam_session_id = $1', [id]);
    return result.rows[0] || null;
  }

  async list() {
    const result = await this.db.query('SELECT * FROM exam_session ORDER BY exam_session_id');
    return result.rows;
  }

  // Patch an allowlisted set of config/schedule columns on a DRAFT session.
  async update(id, patch) {
    const sets = [];
    const values = [];
    let idx = 1;
    for (const [key, val] of Object.entries(patch)) {
      if (!ExamSessionRepository.UPDATABLE_COLUMNS.includes(key) || val === undefined) continue;
      sets.push(`${key} = $${idx++}`);
      values.push(val);
    }
    if (sets.length === 0) return this.findById(id);
    values.push(id);
    const result = await this.db.query(
      `UPDATE exam_session SET ${sets.join(', ')} WHERE exam_session_id = $${idx} RETURNING *`,
      values,
    );
    return result.rows[0] || null;
  }

  async listByCreator(createdBy) {
    const result = await this.db.query(
      'SELECT * FROM exam_session WHERE created_by = $1 ORDER BY exam_session_id',
      [createdBy],
    );
    return result.rows;
  }

  async listBySubjectIds(ids) {
    const subjectIds = Array.from(new Set((ids || []).filter((id) => id != null)));
    if (subjectIds.length === 0) return [];
    const result = await this.db.query(
      'SELECT * FROM exam_session WHERE subject_id = ANY($1) ORDER BY exam_session_id',
      [subjectIds],
    );
    return result.rows;
  }

  async findByIdWithParticipants(id) {
    const session = await this.findById(id);
    if (!session) return null;
    const students = await this.db.query(
      'SELECT * FROM exam_session_student WHERE exam_session_id = $1 ORDER BY exam_session_student_id',
      [id],
    );
    const examiners = await this.db.query(
      'SELECT * FROM exam_session_examiner WHERE exam_session_id = $1 ORDER BY exam_session_examiner_id',
      [id],
    );
    return { ...session, students: students.rows, examiners: examiners.rows };
  }

  // Replace the full student roster for a session in a single transaction:
  // clear existing rows then insert the given ids. Mirrors
  // subjectRepository.setLecturers.
  async setStudents(examSessionId, studentIds) {
    const ids = Array.from(new Set((studentIds || []).filter((id) => id != null)));
    return this.db.withTransaction(async (tx) => {
      await tx.query('DELETE FROM exam_session_student WHERE exam_session_id = $1', [examSessionId]);
      for (const studentId of ids) {
        await tx.query(
          'INSERT INTO exam_session_student (exam_session_id, student_id) VALUES ($1, $2)',
          [examSessionId, studentId],
        );
      }
      const result = await tx.query(
        `SELECT student_id FROM exam_session_student
         WHERE exam_session_id = $1
         ORDER BY student_id`,
        [examSessionId],
      );
      return result.rows.map((row) => row.student_id);
    });
  }

  // Replace the full examiner set for a session in a single transaction.
  async setExaminers(examSessionId, lecturerIds) {
    const ids = Array.from(new Set((lecturerIds || []).filter((id) => id != null)));
    return this.db.withTransaction(async (tx) => {
      await tx.query('DELETE FROM exam_session_examiner WHERE exam_session_id = $1', [examSessionId]);
      for (const lecturerId of ids) {
        await tx.query(
          'INSERT INTO exam_session_examiner (exam_session_id, lecturer_id) VALUES ($1, $2)',
          [examSessionId, lecturerId],
        );
      }
      const result = await tx.query(
        `SELECT lecturer_id FROM exam_session_examiner
         WHERE exam_session_id = $1
         ORDER BY lecturer_id`,
        [examSessionId],
      );
      return result.rows.map((row) => row.lecturer_id);
    });
  }

  async countApprovedQuestionsInTopic(topicId) {
    const result = await this.db.query(
      "SELECT COUNT(*)::int AS count FROM question WHERE topic_id = $1 AND status = 'APPROVED'",
      [topicId],
    );
    return result.rows[0] ? Number(result.rows[0].count) : 0;
  }

  async listApprovedQuestionIdsInTopic(topicId) {
    const result = await this.db.query(
      "SELECT question_id FROM question WHERE topic_id = $1 AND status = 'APPROVED' ORDER BY question_id",
      [topicId],
    );
    return result.rows.map((row) => row.question_id);
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

  async listByStudent(studentId) {
    const result = await this.db.query(
      `SELECT es.*, s.name AS subject_name, s.code AS subject_code,
              t.name AS topic_name,
              vi.viva_interview_id, vi.status AS interview_status,
              vi.started_at AS interview_started_at, vi.deadline_at AS interview_deadline_at
       FROM exam_session es
       JOIN exam_session_student ess ON es.exam_session_id = ess.exam_session_id
       LEFT JOIN subject s ON es.subject_id = s.subject_id
       LEFT JOIN topic t ON es.topic_id = t.topic_id
       LEFT JOIN viva_interview vi ON es.exam_session_id = vi.exam_session_id AND vi.student_id = $1
       WHERE ess.student_id = $1
       ORDER BY es.exam_session_id DESC`,
      [studentId],
    );
    return result.rows;
  }
}

ExamSessionRepository.UPDATABLE_COLUMNS = [
  'title',
  'language',
  'main_question_count',
  'max_follow_ups_per_question',
  'answer_time_limit_sec',
  'think_time_sec',
  'opens_at',
  'closes_at',
  'session_time_limit_sec',
];

module.exports = { ExamSessionRepository };
