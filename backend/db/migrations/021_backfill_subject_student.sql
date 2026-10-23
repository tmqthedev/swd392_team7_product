-- 021 Backfill subject_student from exam_session_student
-- Ensures legacy exam sessions' rosters are reflected in subject enrollment.

INSERT INTO subject_student (subject_id, student_id)
SELECT DISTINCT es.subject_id, ess.student_id
FROM exam_session_student ess
JOIN exam_session es ON es.exam_session_id = ess.exam_session_id
WHERE es.subject_id IS NOT NULL AND ess.student_id IS NOT NULL
ON CONFLICT (subject_id, student_id) DO NOTHING;
