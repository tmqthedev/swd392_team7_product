-- Step 14: who did what to which record, IDs only (owner: no payload/PII).
-- One row per successful admin write (users, subjects, assignments, exams).
CREATE TABLE IF NOT EXISTS admin_audit_log (
  admin_audit_log_id SERIAL PRIMARY KEY,
  actor_id INTEGER REFERENCES app_user (app_user_id) ON DELETE SET NULL,
  action VARCHAR(50) NOT NULL,
  entity_type VARCHAR(30) NOT NULL,
  entity_id INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_entity
  ON admin_audit_log (entity_type, entity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_actor
  ON admin_audit_log (actor_id, created_at DESC);
