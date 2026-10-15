class CourseMaterialRepository {
  constructor(db) {
    this.db = db;
  }

  async create({
    subjectId,
    topicId,
    title,
    fileKey,
    mimeType,
    sizeBytes,
    pageCount,
    status,
    uploadedBy,
  }) {
    const result = await this.db.query(
      `INSERT INTO course_material
         (subject_id, topic_id, title, file_key, mime_type, size_bytes, page_count, status, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, 'UPLOADED'), $9)
       RETURNING *`,
      [
        subjectId ?? null,
        topicId ?? null,
        title ?? null,
        fileKey ?? null,
        mimeType ?? null,
        sizeBytes ?? null,
        pageCount ?? null,
        status ?? null,
        uploadedBy ?? null,
      ],
    );
    return result.rows[0];
  }

  async findById(id) {
    const result = await this.db.query(
      'SELECT * FROM course_material WHERE course_material_id = $1',
      [id],
    );
    return result.rows[0] || null;
  }

  async listBySubject(subjectId) {
    const result = await this.db.query(
      'SELECT * FROM course_material WHERE subject_id = $1 ORDER BY course_material_id',
      [subjectId],
    );
    return result.rows;
  }

  async updateStatus(id, status, error = null) {
    const result = await this.db.query(
      'UPDATE course_material SET status = $1, error = $2 WHERE course_material_id = $3 RETURNING *',
      [status, error, id],
    );
    return result.rows[0] || null;
  }
}

module.exports = { CourseMaterialRepository };
