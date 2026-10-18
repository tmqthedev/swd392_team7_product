-- 013 Material chunk subject: denormalize subject_id onto material_chunk so the
-- RAG retrieval can scope candidate chunks per subject without a join back to
-- course_material, and add a lookup index on material_id. Requires 005
-- (subject) and 006 (course_material/material_chunk). Idempotent on re-run.
--
-- No SET NOT NULL: legacy rows may predate this column; the non-null invariant
-- is owned at upload time (every new chunk is written with its subject_id).

ALTER TABLE material_chunk
  ADD COLUMN IF NOT EXISTS subject_id INTEGER REFERENCES subject (subject_id);

-- Backfill existing chunks from their parent material.
UPDATE material_chunk mc
  SET subject_id = cm.subject_id
  FROM course_material cm
  WHERE cm.course_material_id = mc.material_id
    AND mc.subject_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_material_chunk_material
  ON material_chunk (material_id);
