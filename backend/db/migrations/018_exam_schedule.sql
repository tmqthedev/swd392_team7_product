-- 018 Exam schedule (Step 12): lecturer-scheduled exam window, admin start,
-- Bloom-balanced picking and a per-candidate follow-up cap.
--   * status gains SCHEDULED (DRAFT -> SCHEDULED -> OPEN -> CLOSED).
--   * exam_session gains bloom_distribution (lecturer Bloom mix per candidate),
--     max_follow_ups_total (cap across the whole interview, NULL = no cap),
--     scheduled_at/by (lecturer submit), started_at/by (admin start) and
--     warm_status (STT/TTS warm-up + audio pre-generation progress snapshot).
--   * background_job type gains KEEP_WARM and PREPARE_EXAM_AUDIO.
--   * lookup indexes for the admin schedule list and the per-exam question
--     picker (recent candidates, usage counts).
-- Requires 008 (exam_session, viva_interview, assigned_question), 010
-- (background_job). Idempotent on re-run (DROP CONSTRAINT IF EXISTS then ADD).

ALTER TABLE exam_session
  DROP CONSTRAINT IF EXISTS chk_exam_session_status;
ALTER TABLE exam_session
  ADD CONSTRAINT chk_exam_session_status
    CHECK (status IN ('DRAFT', 'SCHEDULED', 'OPEN', 'CLOSED'));

ALTER TABLE exam_session
  ADD COLUMN IF NOT EXISTS bloom_distribution JSONB,
  ADD COLUMN IF NOT EXISTS max_follow_ups_total INTEGER,
  ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS scheduled_by INTEGER REFERENCES app_user (app_user_id),
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS started_by INTEGER REFERENCES app_user (app_user_id),
  ADD COLUMN IF NOT EXISTS warm_status JSONB;

ALTER TABLE exam_session
  DROP CONSTRAINT IF EXISTS chk_exam_session_max_follow_ups_total;
ALTER TABLE exam_session
  ADD CONSTRAINT chk_exam_session_max_follow_ups_total
    CHECK (max_follow_ups_total IS NULL OR (max_follow_ups_total >= 0 AND max_follow_ups_total <= 20));

ALTER TABLE background_job
  DROP CONSTRAINT IF EXISTS chk_background_job_type;
ALTER TABLE background_job
  ADD CONSTRAINT chk_background_job_type
    CHECK (type IN ('INGEST_MATERIAL', 'GENERATE_QUESTIONS', 'GRADE_INTERVIEW', 'SEND_EMAIL',
                    'KEEP_WARM', 'PREPARE_EXAM_AUDIO'));

CREATE INDEX IF NOT EXISTS idx_exam_session_status_opens_at
  ON exam_session (status, opens_at);

CREATE INDEX IF NOT EXISTS idx_viva_interview_exam_started
  ON viva_interview (exam_session_id, started_at);

CREATE INDEX IF NOT EXISTS idx_assigned_question_question
  ON assigned_question (question_id);
