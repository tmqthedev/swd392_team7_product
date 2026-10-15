-- 001 Baseline: mirrors the original Phase 1 schema so the migration runner
-- alone can build an empty database. Idempotent (CREATE ... IF NOT EXISTS).
-- Uses the ORIGINAL question.status CHECK ('Active','Draft'); migration 007
-- relaxes it after migrating legacy values.

CREATE TABLE IF NOT EXISTS topic (
  topic_id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL
);

CREATE TABLE IF NOT EXISTS rubric (
  rubric_id SERIAL PRIMARY KEY,
  max_score NUMERIC(5, 2) NOT NULL,
  CONSTRAINT chk_rubric_max_score CHECK (max_score > 0)
);

CREATE TABLE IF NOT EXISTS question (
  question_id SERIAL PRIMARY KEY,
  topic_id INTEGER NOT NULL REFERENCES topic (topic_id),
  rubric_id INTEGER REFERENCES rubric (rubric_id),
  content TEXT NOT NULL,
  status VARCHAR(50) NOT NULL,
  CONSTRAINT chk_question_status CHECK (status IN ('Active', 'Draft'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_question_content_normalized
  ON question (LOWER(TRIM(content)));
