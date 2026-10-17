-- 014 Login lockout window: anchor the failed-login window on its own column
-- instead of app_user.updated_at, which any unrelated row update would reset.

ALTER TABLE app_user
  ADD COLUMN IF NOT EXISTS first_failed_at TIMESTAMPTZ;
