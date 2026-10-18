-- 008 Exam & Viva: exam sessions, participants, interviews, Q&A turns,
-- transcripts, and processing failures.
-- Requires 005 (subject) and 007 (question).

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
  CONSTRAINT chk_exam_session_language CHECK (language IN ('VI', 'EN')),
  CONSTRAINT chk_exam_session_status CHECK (status IN ('DRAFT', 'OPEN', 'CLOSED'))
);

CREATE TABLE IF NOT EXISTS exam_session_student (
  exam_session_student_id SERIAL PRIMARY KEY,
  exam_session_id INTEGER NOT NULL REFERENCES exam_session (exam_session_id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES app_user (app_user_id),
  CONSTRAINT uq_exam_session_student UNIQUE (exam_session_id, student_id)
);

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
  CONSTRAINT chk_viva_interview_status
    CHECK (status IN ('NOT_STARTED', 'IN_PROGRESS', 'PAUSED', 'COMPLETED', 'TERMINATED'))
);

CREATE TABLE IF NOT EXISTS assigned_question (
  assigned_question_id SERIAL PRIMARY KEY,
  interview_id INTEGER NOT NULL REFERENCES viva_interview (viva_interview_id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL REFERENCES question (question_id),
  order_no INTEGER,
  is_asked BOOLEAN NOT NULL DEFAULT false
);

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
  CONSTRAINT chk_qa_turn_type CHECK (turn_type IN ('MAIN', 'FOLLOW_UP'))
);

CREATE TABLE IF NOT EXISTS transcript (
  transcript_id SERIAL PRIMARY KEY,
  interview_id INTEGER NOT NULL REFERENCES viva_interview (viva_interview_id) ON DELETE CASCADE,
  full_text TEXT,
  is_complete BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS processing_failure (
  processing_failure_id SERIAL PRIMARY KEY,
  interview_id INTEGER NOT NULL REFERENCES viva_interview (viva_interview_id) ON DELETE CASCADE,
  turn_id INTEGER REFERENCES qa_turn (qa_turn_id),
  stage VARCHAR(50),
  error_code VARCHAR(50),
  message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  resolved BOOLEAN NOT NULL DEFAULT false
);
