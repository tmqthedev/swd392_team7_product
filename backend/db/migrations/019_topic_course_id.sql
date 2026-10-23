-- Step 12: topic.course_id
-- The topic API and the question Excel import (TopicRepository.findByCode)
-- read and write topic.course_id, but no migration ever created it, so both
-- failed on Postgres with DATABASE_ERROR (only the in-memory DB had it).

ALTER TABLE topic
  ADD COLUMN IF NOT EXISTS course_id VARCHAR(50);

CREATE INDEX IF NOT EXISTS idx_topic_course_id ON topic (course_id);
