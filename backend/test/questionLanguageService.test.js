const test = require('node:test');
const assert = require('node:assert/strict');
const {
  detectLanguage,
  normalizeQuestionLanguage,
  examLanguageOf,
  summarizeBankLanguage,
} = require('../src/domain/questionLanguage');

test('detectLanguage spots Vietnamese letters', () => {
  assert.equal(detectLanguage('Trình bày nguyên lý DIP'), 'vi');
  assert.equal(detectLanguage('Explain the Dependency Inversion Principle'), 'en');
  assert.equal(detectLanguage(''), 'en');
});

test('normalizeQuestionLanguage keeps vi/en variants and detects the rest', () => {
  assert.equal(normalizeQuestionLanguage('VI', 'Explain'), 'vi');
  assert.equal(normalizeQuestionLanguage('en-US', 'Trình bày'), 'en');
  assert.equal(normalizeQuestionLanguage(null, 'Hãy giải thích'), 'vi');
  assert.equal(normalizeQuestionLanguage('  ', 'Explain'), 'en');
  assert.equal(normalizeQuestionLanguage('fr', 'Explain'), 'en');
});

test('examLanguageOf maps a question row to VI/EN', () => {
  assert.equal(examLanguageOf({ language: 'vi' }), 'VI');
  assert.equal(examLanguageOf({ language: null, content: 'Áp dụng' }), 'VI');
  assert.equal(examLanguageOf({ question_id: 1 }), 'EN');
});

test('summarizeBankLanguage returns the single language or null', () => {
  assert.deepEqual(summarizeBankLanguage([]), { language: null, counts: { VI: 0, EN: 0 } });
  assert.equal(summarizeBankLanguage([{ language: 'vi' }, { language: 'vi' }]).language, 'VI');
  const mixed = summarizeBankLanguage([{ language: 'vi' }, { language: 'en' }]);
  assert.equal(mixed.language, null);
  assert.deepEqual(mixed.counts, { VI: 1, EN: 1 });
});
