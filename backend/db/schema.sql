-- PostgreSQL schema (human-facing reference) for the unified E2E data model.
--
-- SOURCE OF TRUTH: the numbered files in backend/db/migrations are what the
-- backend actually applies at startup (via src/db/migrationRunner.js). This
-- file is a consolidated, readable snapshot of the final model and is NOT
-- executed by the runner. Keep it in sync with the migrations when the model
-- changes.

CREATE EXTENSION IF NOT EXISTS vector;

-- ---------------------------------------------------------------------------
-- Accounts
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS app_user (
  app_user_id SERIAL PRIMARY KEY,
  code VARCHAR(50) UNIQUE,
  email VARCHAR(255) NOT NULL UNIQUE,
  full_name VARCHAR(255),
  password_hash TEXT,
  role VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  failed_login_count INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  must_change_password BOOLEAN NOT NULL DEFAULT false, -- 011
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),       -- 011
  first_failed_at TIMESTAMPTZ,                         -- 014
  CONSTRAINT chk_app_user_role CHECK (role IN ('ADMIN', 'LECTURER', 'STUDENT')),
  CONSTRAINT chk_app_user_status CHECK (status IN ('ACTIVE', 'LOCKED'))
);

CREATE TABLE IF NOT EXISTS auth_session (
  auth_session_id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES app_user (app_user_id) ON DELETE CASCADE,
  refresh_token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  ip VARCHAR(64),
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS password_token (
  password_token_id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES app_user (app_user_id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  purpose VARCHAR(20) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_password_token_purpose CHECK (purpose IN ('SET', 'RESET'))
);

CREATE INDEX IF NOT EXISTS idx_auth_session_user ON auth_session (user_id);       -- 011
CREATE INDEX IF NOT EXISTS idx_password_token_user ON password_token (user_id);   -- 011

-- ---------------------------------------------------------------------------
-- Subjects & topics
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS subject (
  subject_id SERIAL PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL
);

CREATE TABLE IF NOT EXISTS subject_lecturer (
  subject_lecturer_id SERIAL PRIMARY KEY,
  subject_id INTEGER NOT NULL REFERENCES subject (subject_id) ON DELETE CASCADE,
  lecturer_id INTEGER NOT NULL REFERENCES app_user (app_user_id) ON DELETE CASCADE,
  CONSTRAINT uq_subject_lecturer UNIQUE (subject_id, lecturer_id)
);

CREATE TABLE IF NOT EXISTS topic (
  topic_id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  subject_id INTEGER REFERENCES subject (subject_id),
  course_id VARCHAR(50) -- 019
);

CREATE INDEX IF NOT EXISTS idx_topic_course_id ON topic (course_id);

-- ---------------------------------------------------------------------------
-- Materials
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS course_material (
  course_material_id SERIAL PRIMARY KEY,
  subject_id INTEGER REFERENCES subject (subject_id),
  topic_id INTEGER REFERENCES topic (topic_id),
  title VARCHAR(255) NOT NULL,
  file_key TEXT NOT NULL,
  mime_type VARCHAR(255),
  size_bytes BIGINT,
  page_count INTEGER,
  status VARCHAR(20) NOT NULL DEFAULT 'UPLOADED',
  error TEXT,
  uploaded_by INTEGER REFERENCES app_user (app_user_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_course_material_status
    CHECK (status IN ('UPLOADED', 'PROCESSING', 'READY', 'FAILED'))
);

CREATE TABLE IF NOT EXISTS material_chunk (
  material_chunk_id SERIAL PRIMARY KEY,
  material_id INTEGER NOT NULL REFERENCES course_material (course_material_id) ON DELETE CASCADE,
  chunk_no INTEGER NOT NULL,
  location TEXT,
  content TEXT NOT NULL,
  embedding vector(1024),
  subject_id INTEGER REFERENCES subject (subject_id) -- 013
);

CREATE INDEX IF NOT EXISTS idx_material_chunk_embedding
  ON material_chunk USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS idx_material_chunk_material
  ON material_chunk (material_id); -- 013

-- ---------------------------------------------------------------------------
-- Rubrics & questions
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS rubric (
  rubric_id SERIAL PRIMARY KEY,
  max_score NUMERIC(5, 2) NOT NULL,
  subject_id INTEGER REFERENCES subject (subject_id),
  is_locked BOOLEAN NOT NULL DEFAULT false,
  version INTEGER NOT NULL DEFAULT 1,
  created_by INTEGER REFERENCES app_user (app_user_id),
  CONSTRAINT chk_rubric_max_score CHECK (max_score > 0)
);

CREATE TABLE IF NOT EXISTS rubric_criterion (
  rubric_criterion_id SERIAL PRIMARY KEY,
  rubric_id INTEGER NOT NULL REFERENCES rubric (rubric_id) ON DELETE CASCADE,
  criterion_name VARCHAR(255) NOT NULL,
  weight_percent NUMERIC(5, 2) NOT NULL,
  description TEXT,
  order_index INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT chk_rubric_criterion_weight CHECK (weight_percent > 0 AND weight_percent <= 100)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_rubric_criterion_name
  ON rubric_criterion (rubric_id, LOWER(TRIM(criterion_name)));

CREATE TABLE IF NOT EXISTS performance_level (
  performance_level_id SERIAL PRIMARY KEY,
  criterion_id INTEGER NOT NULL REFERENCES rubric_criterion (rubric_criterion_id) ON DELETE CASCADE,
  label VARCHAR(255) NOT NULL,
  min_score NUMERIC(6, 2),
  max_score NUMERIC(6, 2),
  description TEXT,
  order_no INTEGER
);

CREATE TABLE IF NOT EXISTS question_generation_job (
  question_generation_job_id SERIAL PRIMARY KEY,
  topic_id INTEGER REFERENCES topic (topic_id),
  material_ids JSONB,
  requested_count INTEGER,
  bloom_distribution JSONB,
  language VARCHAR(10),
  status VARCHAR(30),
  generated_count INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  requested_by INTEGER REFERENCES app_user (app_user_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS question (
  question_id SERIAL PRIMARY KEY,
  topic_id INTEGER NOT NULL REFERENCES topic (topic_id),
  rubric_id INTEGER REFERENCES rubric (rubric_id),
  content TEXT NOT NULL,
  status VARCHAR(50) NOT NULL,
  bloom_level VARCHAR(20),
  language VARCHAR(10),
  reference_answer TEXT,
  key_points JSONB,
  source VARCHAR(20),
  rationale JSONB,
  embedding vector(1024),
  generation_job_id INTEGER REFERENCES question_generation_job (question_generation_job_id),
  created_by INTEGER REFERENCES app_user (app_user_id),
  reviewed_by INTEGER REFERENCES app_user (app_user_id),
  reviewed_at TIMESTAMPTZ,
  review_note TEXT,
  CONSTRAINT chk_question_status
    CHECK (status IN ('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'ARCHIVED')),
  CONSTRAINT chk_question_bloom_level
    CHECK (bloom_level IS NULL OR bloom_level IN ('REMEMBER', 'UNDERSTAND', 'APPLY', 'ANALYZE')),
  CONSTRAINT chk_question_source
    CHECK (source IS NULL OR source IN ('MANUAL', 'IMPORT', 'AI'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_question_content_normalized
  ON question (LOWER(TRIM(content)));

CREATE INDEX IF NOT EXISTS idx_question_embedding
  ON question USING hnsw (embedding vector_cosine_ops); -- 012

CREATE TABLE IF NOT EXISTS question_source_ref (
  question_source_ref_id SERIAL PRIMARY KEY,
  question_id INTEGER NOT NULL REFERENCES question (question_id) ON DELETE CASCADE,
  chunk_id INTEGER REFERENCES material_chunk (material_chunk_id),
  excerpt TEXT
);

-- ---------------------------------------------------------------------------
-- Exam sessions & viva interviews
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS exam_session (
  exam_session_id SERIAL PRIMARY KEY,
  subject_id INTEGER REFERENCES subject (subject_id),
  topic_id INTEGER REFERENCES topic (topic_id),
  title VARCHAR(255),
  language VARCHAR(2) NOT NULL,
  main_question_count INTEGER,
  max_follow_ups_per_question INTEGER,
  answer_time_limit_sec INTEGER,
  think_time_sec INTEGER,
  opens_at TIMESTAMPTZ,
  closes_at TIMESTAMPTZ,
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
  created_by INTEGER REFERENCES app_user (app_user_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  session_time_limit_sec INTEGER NOT NULL DEFAULT 1800,          -- 016
  bloom_distribution JSONB,                                      -- 018
  max_follow_ups_total INTEGER,                                  -- 018
  scheduled_at TIMESTAMPTZ,                                      -- 018
  scheduled_by INTEGER REFERENCES app_user (app_user_id),        -- 018
  started_at TIMESTAMPTZ,                                        -- 018
  started_by INTEGER REFERENCES app_user (app_user_id),          -- 018
  warm_status JSONB,                                             -- 018
  CONSTRAINT chk_exam_session_language CHECK (language IN ('VI', 'EN')),
  CONSTRAINT chk_exam_session_status
    CHECK (status IN ('DRAFT', 'SCHEDULED', 'OPEN', 'CLOSED')),  -- 018
  CONSTRAINT chk_exam_session_time_limit CHECK (session_time_limit_sec > 0), -- 016
  CONSTRAINT chk_exam_session_max_follow_ups_total
    CHECK (max_follow_ups_total IS NULL OR (max_follow_ups_total >= 0 AND max_follow_ups_total <= 20)) -- 018
);

CREATE INDEX IF NOT EXISTS idx_exam_session_subject ON exam_session (subject_id);           -- 015
CREATE INDEX IF NOT EXISTS idx_exam_session_status ON exam_session (status);                -- 015
CREATE INDEX IF NOT EXISTS idx_exam_session_status_opens_at ON exam_session (status, opens_at); -- 018

CREATE TABLE IF NOT EXISTS exam_session_student (
  exam_session_student_id SERIAL PRIMARY KEY,
  exam_session_id INTEGER NOT NULL REFERENCES exam_session (exam_session_id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES app_user (app_user_id),
  CONSTRAINT uq_exam_session_student UNIQUE (exam_session_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_exam_session_student_student
  ON exam_session_student (student_id); -- 015

CREATE TABLE IF NOT EXISTS exam_session_examiner (
  exam_session_examiner_id SERIAL PRIMARY KEY,
  exam_session_id INTEGER NOT NULL REFERENCES exam_session (exam_session_id) ON DELETE CASCADE,
  lecturer_id INTEGER NOT NULL REFERENCES app_user (app_user_id)
);

CREATE TABLE IF NOT EXISTS viva_interview (
  viva_interview_id SERIAL PRIMARY KEY,
  exam_session_id INTEGER NOT NULL REFERENCES exam_session (exam_session_id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES app_user (app_user_id),
  status VARCHAR(20) NOT NULL DEFAULT 'NOT_STARTED',
  current_question_index INTEGER NOT NULL DEFAULT 0,
  current_follow_up_count INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ,
  deadline_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  end_reason TEXT,
  client_ip VARCHAR(64),
  paused_at TIMESTAMPTZ, -- 017
  CONSTRAINT chk_viva_interview_status
    CHECK (status IN ('NOT_STARTED', 'IN_PROGRESS', 'PAUSED', 'COMPLETED', 'TERMINATED'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_viva_interview_exam_student
  ON viva_interview (exam_session_id, student_id); -- 016
CREATE INDEX IF NOT EXISTS idx_viva_interview_exam_started
  ON viva_interview (exam_session_id, started_at); -- 018

CREATE TABLE IF NOT EXISTS assigned_question (
  assigned_question_id SERIAL PRIMARY KEY,
  interview_id INTEGER NOT NULL REFERENCES viva_interview (viva_interview_id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL REFERENCES question (question_id),
  order_no INTEGER,
  is_asked BOOLEAN NOT NULL DEFAULT false
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_assigned_question_order
  ON assigned_question (interview_id, order_no); -- 016
CREATE INDEX IF NOT EXISTS idx_assigned_question_question
  ON assigned_question (question_id); -- 018

CREATE TABLE IF NOT EXISTS qa_turn (
  qa_turn_id SERIAL PRIMARY KEY,
  interview_id INTEGER NOT NULL REFERENCES viva_interview (viva_interview_id) ON DELETE CASCADE,
  assigned_question_id INTEGER REFERENCES assigned_question (assigned_question_id),
  sequence_no INTEGER,
  turn_type VARCHAR(20) NOT NULL,
  follow_up_reason TEXT,
  question_text TEXT,
  rationale JSONB,
  answer_text TEXT,
  answer_audio_key TEXT,
  transcript_confidence NUMERIC(5, 4),
  asked_at TIMESTAMPTZ,
  answer_started_at TIMESTAMPTZ,
  answer_ended_at TIMESTAMPTZ,
  timed_out BOOLEAN,
  status VARCHAR(30),
  response_latency_ms INTEGER,
  speech_duration_ms INTEGER,
  words_per_minute NUMERIC(6, 2),
  pause_count INTEGER,
  question_audio_key TEXT,                     -- 016
  played_at TIMESTAMPTZ,                       -- 016
  answer_deadline_at TIMESTAMPTZ,              -- 016
  retry_count INTEGER NOT NULL DEFAULT 0,      -- 017
  CONSTRAINT chk_qa_turn_type CHECK (turn_type IN ('MAIN', 'FOLLOW_UP')),
  CONSTRAINT chk_qa_turn_status CHECK (status IS NULL OR status IN
    ('ASKED', 'ANSWERING', 'PROCESSING', 'ANSWERED', 'UNANSWERED', 'FAILED')) -- 016
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_qa_turn_sequence
  ON qa_turn (interview_id, sequence_no); -- 016
CREATE INDEX IF NOT EXISTS idx_qa_turn_interview
  ON qa_turn (interview_id); -- 016

CREATE TABLE IF NOT EXISTS transcript (
  transcript_id SERIAL PRIMARY KEY,
  interview_id INTEGER NOT NULL REFERENCES viva_interview (viva_interview_id) ON DELETE CASCADE,
  full_text TEXT,
  is_complete BOOLEAN NOT NULL DEFAULT false
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_transcript_interview
  ON transcript (interview_id); -- 016

CREATE TABLE IF NOT EXISTS processing_failure (
  processing_failure_id SERIAL PRIMARY KEY,
  interview_id INTEGER NOT NULL REFERENCES viva_interview (viva_interview_id) ON DELETE CASCADE,
  turn_id INTEGER REFERENCES qa_turn (qa_turn_id),
  stage VARCHAR(50),
  error_code VARCHAR(50),
  message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  resolved BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now() -- 016
);

CREATE INDEX IF NOT EXISTS idx_processing_failure_interview
  ON processing_failure (interview_id); -- 016

-- ---------------------------------------------------------------------------
-- Scoring
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- Background jobs
-- ---------------------------------------------------------------------------

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
    CHECK (type IN ('INGEST_MATERIAL', 'GENERATE_QUESTIONS', 'GRADE_INTERVIEW', 'SEND_EMAIL',
                    'KEEP_WARM', 'PREPARE_EXAM_AUDIO', 'EXPIRE_INTERVIEWS')), -- 023
  CONSTRAINT chk_background_job_status
    CHECK (status IN ('PENDING', 'RUNNING', 'DONE', 'FAILED'))
);

CREATE INDEX IF NOT EXISTS idx_background_job_status_run_after
  ON background_job (status, run_after);
