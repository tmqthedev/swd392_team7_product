-- 005 Subjects: subjects, lecturer assignments, and topic -> subject link.

CREATE TABLE IF NOT EXISTS subject (
  subject_id SERIAL PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL
);

CREATE TABLE IF NOT EXISTS subject_lecturer (
  subject_lecturer_id SERIAL PRIMARY KEY,
  subject_id INTEGER NOT NULL REFERENCES subject (subject_id) ON DELETE CASCADE,
  lecturer_id INTEGER NOT NULL REFERENCES app_user (app_user_id) ON DELETE CASCADE,
  CONSTRAINT uq_subject_lecturer UNIQUE (subject_id, lecturer_id)
);

ALTER TABLE topic
  ADD COLUMN IF NOT EXISTS subject_id INTEGER REFERENCES subject (subject_id);
