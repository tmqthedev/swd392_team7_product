-- Phase 2: Rubric + RubricCriterion (extends Phase 1 schema).
-- Run after schema.sql on existing databases where rubric was a stub table.

ALTER TABLE rubric
  ADD COLUMN IF NOT EXISTS max_score NUMERIC(5, 2);

UPDATE rubric SET max_score = 10 WHERE max_score IS NULL;

ALTER TABLE rubric
  ALTER COLUMN max_score SET NOT NULL;

ALTER TABLE rubric
  DROP CONSTRAINT IF EXISTS chk_rubric_max_score;

ALTER TABLE rubric
  ADD CONSTRAINT chk_rubric_max_score CHECK (max_score > 0);

CREATE TABLE IF NOT EXISTS rubric_criterion (
  rubric_criterion_id SERIAL PRIMARY KEY,
  rubric_id INTEGER NOT NULL REFERENCES rubric (rubric_id) ON DELETE CASCADE,
  criterion_name VARCHAR(255) NOT NULL,
  weight_percent NUMERIC(5, 2) NOT NULL,
  description TEXT,
  CONSTRAINT chk_rubric_criterion_weight CHECK (weight_percent > 0 AND weight_percent <= 100)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_rubric_criterion_name
  ON rubric_criterion (rubric_id, LOWER(TRIM(criterion_name)));
