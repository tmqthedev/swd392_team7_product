-- 004 Accounts: application users, auth sessions, and password set/reset tokens.

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
