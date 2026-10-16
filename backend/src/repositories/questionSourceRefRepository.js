// Persistence for question_source_ref: the citations linking an AI-generated
// question back to the material_chunk rows it was grounded in.
//
// Citation-in-scope invariant (Finding 4): a persisted chunk_id is ALWAYS a
// chunk of one of the generation job's validated materials. The generation
// handler only ever persists citations whose chunk_id is a key of R, and R is
// built exclusively from materialChunkRepository.findNearestForTopic({
// materialIds }) over the job's validated READY materials. Therefore no row
// here can reference a chunk outside the job's subject-scoped materials.
class QuestionSourceRefRepository {
  constructor(db) {
    this.db = db;
  }

  async create({ questionId, chunkId, excerpt }, client = this.db) {
    const result = await client.query(
      `INSERT INTO question_source_ref (question_id, chunk_id, excerpt)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [questionId, chunkId ?? null, excerpt ?? null],
    );
    return result.rows[0];
  }

  async listByQuestion(questionId, client = this.db) {
    const result = await client.query(
      `SELECT question_source_ref_id, question_id, chunk_id, excerpt
         FROM question_source_ref
        WHERE question_id = $1
        ORDER BY question_source_ref_id`,
      [questionId],
    );
    return result.rows;
  }

  // Join citations to their chunk + material so the review UI can show where a
  // question came from (material title + page/slide location + chunk content).
  async listByQuestionWithMaterial(questionId, client = this.db) {
    const result = await client.query(
      `SELECT qsr.chunk_id        AS "chunkId",
              qsr.excerpt         AS excerpt,
              cm.title            AS "materialTitle",
              mc.location         AS location,
              mc.content          AS content
         FROM question_source_ref qsr
         JOIN material_chunk mc ON mc.material_chunk_id = qsr.chunk_id
         JOIN course_material cm ON cm.course_material_id = mc.material_id
        WHERE qsr.question_id = $1
        ORDER BY qsr.question_source_ref_id`,
      [questionId],
    );
    return result.rows;
  }
}

module.exports = { QuestionSourceRefRepository };
