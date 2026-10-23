-- 020 Subject Student: enrollment of students in subjects.
-- Mirrors subject_lecturer in 005_subjects.sql.

CREATE TABLE IF NOT EXISTS subject_student (
  subject_student_id SERIAL PRIMARY KEY,
  subject_id INTEGER NOT NULL REFERENCES subject (subject_id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES app_user (app_user_id) ON DELETE CASCADE,
  CONSTRAINT uq_subject_student UNIQUE (subject_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_subject_student_subject ON subject_student (subject_id);
CREATE INDEX IF NOT EXISTS idx_subject_student_student ON subject_student (student_id);
