-- Step 14: rubrics get a display name so pickers do not have to show
-- "#id (max 10)". Optional; existing rubrics keep NULL and fall back to the id.
ALTER TABLE rubric
  ADD COLUMN IF NOT EXISTS name VARCHAR(255);
