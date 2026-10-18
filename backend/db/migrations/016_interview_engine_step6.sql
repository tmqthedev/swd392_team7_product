-- 016 Interview engine Step 6: lecturer-set total session time, per-turn
-- audio/played/answer-deadline columns, qa_turn status CHECK, and the unique
-- keys the engine relies on (one interview per student per exam, ordered
-- assignments, ordered turns, one transcript per interview).
-- Requires 008 (exam_session, viva_interview, assigned_question, qa_turn,
-- transcript, processing_failure). Idempotent on re-run (DROP CONSTRAINT IF
-- EXISTS then ADD, as in 007). Unique indexes are safe: no code created
-- interview rows before Step 6.

ALTER TABLE exam_session
  ADD COLUMN IF NOT EXISTS session_time_limit_sec INTEGER NOT NULL DEFAULT 1800;
ALTER TABLE exam_session
  DROP CONSTRAINT IF EXISTS chk_exam_session_time_limit;
ALTER TABLE exam_session
  ADD CONSTRAINT chk_exam_session_time_limit CHECK (session_time_limit_sec > 0);

ALTER TABLE qa_turn
  ADD COLUMN IF NOT EXISTS question_audio_key TEXT,
  ADD COLUMN IF NOT EXISTS played_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS answer_deadline_at TIMESTAMPTZ;
ALTER TABLE qa_turn
  DROP CONSTRAINT IF EXISTS chk_qa_turn_status;
ALTER TABLE qa_turn
  ADD CONSTRAINT chk_qa_turn_status CHECK (status IS NULL OR status IN
    ('ASKED', 'ANSWERING', 'PROCESSING', 'ANSWERED', 'UNANSWERED', 'FAILED'));

ALTER TABLE processing_failure
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS uq_viva_interview_exam_student
  ON viva_interview (exam_session_id, student_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_assigned_question_order
  ON assigned_question (interview_id, order_no);
CREATE UNIQUE INDEX IF NOT EXISTS uq_qa_turn_sequence
  ON qa_turn (interview_id, sequence_no);
CREATE UNIQUE INDEX IF NOT EXISTS uq_transcript_interview
  ON transcript (interview_id);
CREATE INDEX IF NOT EXISTS idx_qa_turn_interview
  ON qa_turn (interview_id);
CREATE INDEX IF NOT EXISTS idx_processing_failure_interview
  ON processing_failure (interview_id);
