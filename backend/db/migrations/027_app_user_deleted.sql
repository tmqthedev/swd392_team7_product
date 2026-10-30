-- Step 14: admins soft-delete users. A DELETED user keeps its rows (exam
-- history, audit) but cannot sign in and is hidden from user lists/pickers.
ALTER TABLE app_user
  DROP CONSTRAINT IF EXISTS chk_app_user_status;

ALTER TABLE app_user
  ADD CONSTRAINT chk_app_user_status CHECK (status IN ('ACTIVE', 'LOCKED', 'DELETED'));
