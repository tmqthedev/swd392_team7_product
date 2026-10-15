-- 009 Scoring: viva results, per-question evaluations, criterion scores,
-- and manual score adjustments.
-- Requires 007 (rubric_criterion) and 008 (viva_interview, assigned_question).

CREATE TABLE IF NOT EXISTS viva_result (
  viva_result_id SERIAL PRIMARY KEY,
  interview_id INTEGER NOT NULL UNIQUE REFERENCES viva_interview (viva_interview_id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  ai_total_score NUMERIC(6, 2),
  final_total_score NUMERIC(6, 2),
  finalized_by INTEGER REFERENCES app_user (app_user_id),
  finalized_at TIMESTAMPTZ,
  CONSTRAINT chk_viva_result_status
    CHECK (status IN ('PENDING', 'AI_SCORING', 'AI_SUGGESTED', 'FLAGGED', 'FINALIZED'))
);

CREATE TABLE IF NOT EXISTS question_evaluation (
  question_evaluation_id SERIAL PRIMARY KEY,
  result_id INTEGER NOT NULL REFERENCES viva_result (viva_result_id) ON DELETE CASCADE,
  assigned_question_id INTEGER REFERENCES assigned_question (assigned_question_id),
  ai_score NUMERIC(6, 2),
  final_score NUMERIC(6, 2),
  confidence NUMERIC(5, 4),
  strengths TEXT,
  weaknesses TEXT,
  missing_points JSONB,
  feedback TEXT,
  flag_reason TEXT,
  model_id VARCHAR(255),
  prompt_version VARCHAR(50)
);

CREATE TABLE IF NOT EXISTS criterion_score (
  criterion_score_id SERIAL PRIMARY KEY,
  evaluation_id INTEGER NOT NULL REFERENCES question_evaluation (question_evaluation_id) ON DELETE CASCADE,
  criterion_id INTEGER REFERENCES rubric_criterion (rubric_criterion_id),
  ai_level_id INTEGER REFERENCES performance_level (performance_level_id),
  ai_score NUMERIC(6, 2),
  ai_justification TEXT,
  evidence JSONB,
  final_score NUMERIC(6, 2)
);

CREATE TABLE IF NOT EXISTS score_adjustment (
  score_adjustment_id SERIAL PRIMARY KEY,
  criterion_score_id INTEGER NOT NULL REFERENCES criterion_score (criterion_score_id) ON DELETE CASCADE,
  old_score NUMERIC(6, 2),
  new_score NUMERIC(6, 2),
  reason TEXT,
  adjusted_by INTEGER REFERENCES app_user (app_user_id),
  adjusted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
