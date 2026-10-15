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

  async updateStatus(id, status, error = null, client = this.db) {
    const result = await client.query(
      'UPDATE course_material SET status = $1, error = $2 WHERE course_material_id = $3 RETURNING *',
      [status, error, id],
    );
    return result.rows[0] || null;
  }

  // Finding 1: persist the parser's page/slide count after ingestion. Accepts
  // an optional tx client so the ingest handler can write it inside the same
  // transaction that replaces the chunks and flips status to READY.
  async setPageCount(id, pageCount, client = this.db) {
    const result = await client.query(
      'UPDATE course_material SET page_count = $1 WHERE course_material_id = $2 RETURNING *',
      [pageCount ?? null, id],
    );
    return result.rows[0] || null;
  }

  // Finding 3: count questions that cite any chunk of this material. The INNER
  // JOIN naturally ignores question_source_ref rows whose chunk_id is NULL
  // (manual/import questions carry no chunk), so only genuine citations count.
  async countCitingQuestions(materialId, client = this.db) {
    const result = await client.query(
      `SELECT COUNT(*)::int AS n
         FROM question_source_ref qsr
         JOIN material_chunk mc ON mc.material_chunk_id = qsr.chunk_id
        WHERE mc.material_id = $1`,
      [materialId],
    );
    return result.rows[0] ? result.rows[0].n : 0;
  }

  async deleteById(materialId, client = this.db) {
    const result = await client.query(
      'DELETE FROM course_material WHERE course_material_id = $1 RETURNING *',
      [materialId],
    );
    return result.rows[0] || null;
  }
}

module.exports = { CourseMaterialRepository };
