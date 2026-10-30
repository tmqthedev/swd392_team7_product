-- Step 13: an exam's language is derived from its topic's APPROVED questions,
-- so every question needs a definite language. Normalize existing values to
-- 'vi' / 'en' and backfill NULL or unknown ones from the content (Vietnamese
-- letters => 'vi', otherwise 'en'), matching domain/questionLanguage.js.
UPDATE question SET language = 'vi'
 WHERE lower(trim(coalesce(language, ''))) LIKE 'vi%' AND language <> 'vi';

UPDATE question SET language = 'en'
 WHERE lower(trim(coalesce(language, ''))) LIKE 'en%' AND language <> 'en';

UPDATE question
   SET language = CASE
     WHEN content ~* '[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]' THEN 'vi'
     ELSE 'en'
   END
 WHERE language IS NULL OR language NOT IN ('vi', 'en');
