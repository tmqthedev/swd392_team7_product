-- 010 Background job: durable queue backing async work (ingest, generation,
-- grading, email).

CREATE TABLE IF NOT EXISTS background_job (
  background_job_id SERIAL PRIMARY KEY,
  type VARCHAR(30) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER,
  run_after TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_background_job_type
    CHECK (type IN ('INGEST_MATERIAL', 'GENERATE_QUESTIONS', 'GRADE_INTERVIEW', 'SEND_EMAIL')),
  CONSTRAINT chk_background_job_status
    CHECK (status IN ('PENDING', 'RUNNING', 'DONE', 'FAILED'))
);

CREATE INDEX IF NOT EXISTS idx_background_job_status_run_after
  ON background_job (status, run_after);
