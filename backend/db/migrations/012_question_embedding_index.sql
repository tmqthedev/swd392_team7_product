-- 012 Question embedding index: HNSW cosine index on question.embedding so the
-- near-duplicate scan can use ANN search, mirroring the material_chunk index in
-- 006_materials.sql. No column is added: migration 007 already provides every
-- Step-3 column and the "question purpose" is stored in the existing
-- rationale JSONB as rationale.purpose. Requires 003 (vector extension) and 007
-- (question.embedding column). Idempotent on re-run.

CREATE INDEX IF NOT EXISTS idx_question_embedding
  ON question USING hnsw (embedding vector_cosine_ops);
