-- Migration 023: Allow EXPIRE_INTERVIEWS background job type in Postgres constraint.
ALTER TABLE background_job
  DROP CONSTRAINT IF EXISTS chk_background_job_type;

ALTER TABLE background_job
  ADD CONSTRAINT chk_background_job_type
    CHECK (type IN ('INGEST_MATERIAL', 'GENERATE_QUESTIONS', 'GRADE_INTERVIEW', 'SEND_EMAIL',
                    'KEEP_WARM', 'PREPARE_EXAM_AUDIO', 'EXPIRE_INTERVIEWS'));
