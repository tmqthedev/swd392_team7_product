-- Step 14: a generation job may carry the rubric to attach to every draft,
-- so AI questions can be approved without picking a rubric one by one.
ALTER TABLE question_generation_job
  ADD COLUMN IF NOT EXISTS rubric_id INTEGER REFERENCES rubric (rubric_id) ON DELETE SET NULL;
