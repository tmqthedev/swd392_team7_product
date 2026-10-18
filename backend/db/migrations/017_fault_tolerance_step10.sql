-- Step 10: Fault tolerance & reconnection (A1-A8)
-- Adds retry_count to qa_turn, paused_at to viva_interview

ALTER TABLE qa_turn
  ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE viva_interview
  ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ;
