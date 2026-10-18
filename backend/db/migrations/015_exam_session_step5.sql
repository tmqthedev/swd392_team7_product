-- 015 Exam session Step 5: additive lookup indexes for the /exam-sessions
-- domain. 008 already defines every exam_session Nhom-3 config column and the
-- exam_session_student / exam_session_examiner tables, so no ALTER is needed
-- here. Requires 008 (exam_session, exam_session_student). Idempotent on re-run.

CREATE INDEX IF NOT EXISTS idx_exam_session_subject
  ON exam_session (subject_id);

CREATE INDEX IF NOT EXISTS idx_exam_session_status
  ON exam_session (status);

CREATE INDEX IF NOT EXISTS idx_exam_session_student_student
  ON exam_session_student (student_id);
