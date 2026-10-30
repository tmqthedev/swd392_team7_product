-- Step 14: a subject that already has content (topics, materials, rubrics,
-- exams) cannot be deleted without losing history, so it can be ARCHIVED
-- instead: hidden from pickers, no new exams, past results stay readable.
ALTER TABLE subject
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE';

ALTER TABLE subject
  DROP CONSTRAINT IF EXISTS chk_subject_status;

ALTER TABLE subject
  ADD CONSTRAINT chk_subject_status CHECK (status IN ('ACTIVE', 'ARCHIVED'));
