-- 007 Questions & Rubrics: extend rubric/question for the unified model,
-- add performance levels, generation jobs, source refs, migrate legacy
-- question.status values, and relax the status CHECK.
-- Requires 003 (vector extension) and 005 (subject).

ALTER TABLE rubric
  ADD COLUMN IF NOT EXISTS subject_id INTEGER REFERENCES subject (subject_id),
  ADD COLUMN IF NOT EXISTS is_locked BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES app_user (app_user_id);

CREATE TABLE IF NOT EXISTS performance_level (
  performance_level_id SERIAL PRIMARY KEY,
  criterion_id INTEGER NOT NULL REFERENCES rubric_criterion (rubric_criterion_id) ON DELETE CASCADE,
  label VARCHAR(255) NOT NULL,
  min_score NUMERIC(6, 2),
  max_score NUMERIC(6, 2),
  description TEXT,
  order_no INTEGER
);

CREATE TABLE IF NOT EXISTS question_generation_job (
  question_generation_job_id SERIAL PRIMARY KEY,
  topic_id INTEGER REFERENCES topic (topic_id),
  material_ids JSONB,
  requested_count INTEGER,
  bloom_distribution JSONB,
  language VARCHAR(10),
  status VARCHAR(30),
  generated_count INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  requested_by INTEGER REFERENCES app_user (app_user_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE question
  ADD COLUMN IF NOT EXISTS bloom_level VARCHAR(20),
  ADD COLUMN IF NOT EXISTS language VARCHAR(10),
  ADD COLUMN IF NOT EXISTS reference_answer TEXT,
  ADD COLUMN IF NOT EXISTS key_points JSONB,
  ADD COLUMN IF NOT EXISTS source VARCHAR(20),
  ADD COLUMN IF NOT EXISTS rationale JSONB,
  ADD COLUMN IF NOT EXISTS embedding vector(1024),
  ADD COLUMN IF NOT EXISTS generation_job_id INTEGER
    REFERENCES question_generation_job (question_generation_job_id),
  ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES app_user (app_user_id),
  ADD COLUMN IF NOT EXISTS reviewed_by INTEGER REFERENCES app_user (app_user_id),
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS review_note TEXT;

ALTER TABLE question
  DROP CONSTRAINT IF EXISTS chk_question_bloom_level;
ALTER TABLE question
  ADD CONSTRAINT chk_question_bloom_level
    CHECK (bloom_level IS NULL OR bloom_level IN ('REMEMBER', 'UNDERSTAND', 'APPLY', 'ANALYZE'));

ALTER TABLE question
  DROP CONSTRAINT IF EXISTS chk_question_source;
ALTER TABLE question
  ADD CONSTRAINT chk_question_source
    CHECK (source IS NULL OR source IN ('MANUAL', 'IMPORT', 'AI'));

-- Legacy status data-migration before relaxing the CHECK.
UPDATE question SET status = 'APPROVED' WHERE status = 'Active';
UPDATE question SET status = 'DRAFT' WHERE status = 'Draft';

ALTER TABLE question
  DROP CONSTRAINT IF EXISTS chk_question_status;
ALTER TABLE question
  ADD CONSTRAINT chk_question_status
    CHECK (status IN ('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'ARCHIVED'));

CREATE TABLE IF NOT EXISTS question_source_ref (
  question_source_ref_id SERIAL PRIMARY KEY,
  question_id INTEGER NOT NULL REFERENCES question (question_id) ON DELETE CASCADE,
  chunk_id INTEGER REFERENCES material_chunk (material_chunk_id),
  excerpt TEXT
);
