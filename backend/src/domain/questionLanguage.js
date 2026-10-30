// Question language is fixed by the question itself ('vi' | 'en'); an exam's
// language is derived from its topic's APPROVED bank and is never chosen
// separately, so the spoken exam, STT, TTS and grading cannot disagree with
// the question text.

// Vietnamese letters that do not occur in plain English text.
const VIETNAMESE_CHARS = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;

function detectLanguage(content) {
  return VIETNAMESE_CHARS.test(String(content || '')) ? 'vi' : 'en';
}

// Normalize a stored/submitted question language to 'vi' | 'en'. An empty or
// unrecognized value falls back to detection from the question content.
function normalizeQuestionLanguage(value, content) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw.startsWith('vi')) return 'vi';
  if (raw.startsWith('en')) return 'en';
  return detectLanguage(content);
}

// Exam language code (VI | EN) for a question row.
function examLanguageOf(question) {
  return normalizeQuestionLanguage(question && question.language, question && question.content) === 'vi'
    ? 'VI'
    : 'EN';
}

// { language: 'VI' | 'EN' | null, counts: { VI, EN } }. language is null when
// the bank is empty or mixes both languages.
function summarizeBankLanguage(bank) {
  const counts = { VI: 0, EN: 0 };
  for (const question of bank || []) counts[examLanguageOf(question)] += 1;
  let language = null;
  if (counts.VI > 0 && counts.EN === 0) language = 'VI';
  else if (counts.EN > 0 && counts.VI === 0) language = 'EN';
  return { language, counts };
}

module.exports = {
  detectLanguage,
  normalizeQuestionLanguage,
  examLanguageOf,
  summarizeBankLanguage,
};
