-- 011 Auth step 2: extend app_user with password-change tracking and an
-- updated_at timestamp, and add lookup indexes for session / token revocation.
-- Only ALTERs/indexes against the existing 004/005 tables; never recreate them.

ALTER TABLE app_user
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_auth_session_user ON auth_session (user_id);
CREATE INDEX IF NOT EXISTS idx_password_token_user ON password_token (user_id);
