-- PostgreSQL schema for Question CRUD (Phase 1).
-- Aligns with ERD entities: Question, Topic, Rubric.
-- Official ERD document is not in the repository; see report assumptions if columns differ.

CREATE TABLE IF NOT EXISTS topic (
  topic_id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL
);

CREATE TABLE IF NOT EXISTS rubric (
  rubric_id SERIAL PRIMARY KEY,
  max_score NUMERIC(5, 2) NOT NULL,
  CONSTRAINT chk_rubric_max_score CHECK (max_score > 0)
);

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
