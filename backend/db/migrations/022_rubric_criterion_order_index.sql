-- 022: Add order_index column to rubric_criterion to preserve criterion order
ALTER TABLE rubric_criterion
  ADD COLUMN IF NOT EXISTS order_index INTEGER NOT NULL DEFAULT 1;
