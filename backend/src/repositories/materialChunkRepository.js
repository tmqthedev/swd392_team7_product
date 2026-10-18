const { toVectorLiteral } = require('./questionRepository');

class MaterialChunkRepository {
  constructor(db) {
    this.db = db;
  }

  // Insert every chunk of a material in one statement, stamping subject_id on
  // each row (denormalized from the parent material for subject-scoped RAG) and
  // serializing embeddings into the pgvector text literal. Accepts an optional
  // tx client so the ingest handler can run inside its replace-and-reindex
  // transaction. Returns the inserted rows.
  async insertMany(materialId, subjectId, chunks, client = this.db) {
    const rows = Array.isArray(chunks) ? chunks : [];
    if (rows.length === 0) return [];

    const values = [];
    const params = [];
    let p = 0;
    for (const chunk of rows) {
      const chunkNo = chunk.chunk_no;
      const location = chunk.location ?? null;
      const content = chunk.content;
      const embedding = toVectorLiteral(chunk.embedding);
      values.push(
        `($${(p += 1)}, $${(p += 1)}, $${(p += 1)}, $${(p += 1)}, $${(p += 1)}, $${(p += 1)})`,
      );
      params.push(materialId, subjectId ?? null, chunkNo, location, content, embedding);
    }

    const result = await client.query(
      `INSERT INTO material_chunk
         (material_id, subject_id, chunk_no, location, content, embedding)
       VALUES ${values.join(', ')}
       RETURNING *`,
      params,
    );
    return result.rows;
  }

  async deleteByMaterial(materialId, client = this.db) {
    const result = await client.query(
      'DELETE FROM material_chunk WHERE material_id = $1 RETURNING material_chunk_id',
      [materialId],
    );
    return result.rows.length;
  }

  // Retrieve the nearest chunks to a query embedding across one or more
  // materials. To avoid any single material dominating, we take the top
  // ceil(limit / numMaterials) chunks per material via a windowed ROW_NUMBER()
  // partitioned by material, then re-rank the survivors globally by cosine
  // distance and truncate to `limit`.
  async findNearestForTopic({ materialIds, queryEmbedding, limit = 10 }, client = this.db) {
    const ids = Array.isArray(materialIds) ? materialIds.filter((id) => id != null) : [];
    if (ids.length === 0) return [];
    const vectorLiteral = toVectorLiteral(queryEmbedding);
    if (vectorLiteral == null) return [];

    const perMaterial = Math.max(1, Math.ceil(limit / ids.length));
    const result = await client.query(
      `WITH ranked AS (
         SELECT
           mc.material_chunk_id,
           mc.material_id,
           mc.location,
           mc.content,
           mc.embedding <=> $2::vector AS distance,
           ROW_NUMBER() OVER (
             PARTITION BY mc.material_id
             ORDER BY mc.embedding <=> $2::vector
           ) AS rn
         FROM material_chunk mc
         WHERE mc.material_id = ANY($1)
           AND mc.embedding IS NOT NULL
       )
       SELECT material_chunk_id, material_id, location, content
         FROM ranked
        WHERE rn <= $3
        ORDER BY distance
        LIMIT $4`,
      [ids, vectorLiteral, perMaterial, limit],
    );
    return result.rows;
  }
}

module.exports = { MaterialChunkRepository };
