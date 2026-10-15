-- 006 Materials: uploaded course materials and their embedded chunks.
-- Requires 003 (vector extension) and 005 (subject).

CREATE TABLE IF NOT EXISTS course_material (
  course_material_id SERIAL PRIMARY KEY,
  subject_id INTEGER REFERENCES subject (subject_id),
  topic_id INTEGER REFERENCES topic (topic_id),
  title VARCHAR(255) NOT NULL,
  file_key TEXT NOT NULL,
  mime_type VARCHAR(255),
  size_bytes BIGINT,
  page_count INTEGER,
  status VARCHAR(20) NOT NULL DEFAULT 'UPLOADED',
  error TEXT,
  uploaded_by INTEGER REFERENCES app_user (app_user_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_course_material_status
    CHECK (status IN ('UPLOADED', 'PROCESSING', 'READY', 'FAILED'))
);

CREATE TABLE IF NOT EXISTS material_chunk (
  material_chunk_id SERIAL PRIMARY KEY,
  material_id INTEGER NOT NULL REFERENCES course_material (course_material_id) ON DELETE CASCADE,
  chunk_no INTEGER NOT NULL,
  location TEXT,
  content TEXT NOT NULL,
  embedding vector(1024)
);

CREATE INDEX IF NOT EXISTS idx_material_chunk_embedding
  ON material_chunk USING hnsw (embedding vector_cosine_ops);
