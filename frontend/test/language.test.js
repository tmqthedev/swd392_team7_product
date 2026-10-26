import test from 'node:test';
import assert from 'node:assert/strict';
import { dictionaries, setLanguage, getLanguage, t, enumLabel, translateMessage, errorMessage, formatNumber } from '../src/i18n/core.js';
import { playBrowserQuestion, resendAudioAnswer } from '../src/shared/utils/interviewAudio.js';

test('dictionaries have identical keys and interpolation parameters', () => {
  assert.deepEqual(Object.keys(dictionaries.vi).sort(), Object.keys(dictionaries.en).sort());
  for (const key of Object.keys(dictionaries.vi)) {
    const params = value => [...value.matchAll(/\{\w+\}/g)].map(match => match[0]).sort();
    assert.deepEqual(params(dictionaries.vi[key]), params(dictionaries.en[key]), key);
  }
});
test('language preference updates document and persists, including when storage is blocked', () => {
  let saved;
  globalThis.localStorage = { setItem(key, value) { saved = [key, value]; } };
  globalThis.document = { documentElement: {} };
  setLanguage('en');
  assert.equal(getLanguage(), 'en');
  assert.equal(document.documentElement.lang, 'en');
  assert.deepEqual(saved, ['aives.uiLanguage', 'en']);
  globalThis.localStorage = { setItem() { throw new Error('blocked'); } };
  assert.doesNotThrow(() => setLanguage('vi'));
  assert.equal(t('Sign in'), 'Đăng nhập');
  assert.equal(enumLabel('PENDING_REVIEW'), 'Chờ duyệt');
  assert.equal(formatNumber(8.5), '8,5');
  assert.equal(t('Untranslated user content'), 'Untranslated user content');
  delete globalThis.document;
  delete globalThis.localStorage;
});
test('existing feedback translates across switches and backend errors use codes', () => {
  setLanguage('vi');
  assert.equal(translateMessage('Enter your password.'), 'Nhập mật khẩu.');
  assert.equal(translateMessage('Enter your email or student ID.'), 'Nhập email hoặc mã sinh viên.');
  const message = t('Imported {v0} student(s). Setup links have been emailed.', { v0: 4 });
  setLanguage('en');
  assert.equal(translateMessage(message), 'Imported 4 student(s). Setup links have been emailed.');
  assert.match(errorMessage({ code: 'STT_FAILED' }), /record your answer again/);
  assert.equal(errorMessage({ code: 'UNKNOWN', message: 'secret stack trace', status: 500 }).includes('secret'), false);
});
test('browser fallback follows exam language independently of UI and completes once', () => {
  class Utterance { constructor(text) { this.text = text; } }
  for (const [ui, exam, expected] of [['vi', 'EN', 'en-US'], ['en', 'VI', 'vi-VN']]) {
    setLanguage(ui);
    let captured, completed = 0;
    const speech = { cancel() {}, speak(utterance) { captured = utterance; } };
    const result = playBrowserQuestion('Original question', exam, () => { completed++; }, { speech, Utterance });
    assert.equal(result.supported, true);
    assert.equal(captured.lang, expected);
    assert.equal(captured.text, 'Original question');
    captured.onend(); captured.onerror();
    assert.equal(completed, 1);
    result.cancel(); captured.onend();
    assert.equal(completed, 1);
  }
});
test('unsupported or failing browser speech leaves continuation to the visible UI', () => {
  let completed = 0;
  assert.equal(playBrowserQuestion('Question', 'VI', () => completed++, { speech: null }).supported, false);
  assert.equal(playBrowserQuestion('Question', 'EN', () => completed++, {
    speech: { cancel() {}, speak() { throw new Error('unsupported'); } }, Utterance: class {},
  }).supported, false);
  let utterance;
  let unavailable = 0;
  const playback = playBrowserQuestion('Question', 'VI', () => completed++, {
    speech: { cancel() {}, speak(value) { utterance = value; } }, Utterance: class {},
    onUnavailable: () => unavailable++,
  });
  assert.equal(playback.supported, true);
  utterance.onerror();
  assert.equal(unavailable, 1);
  assert.equal(completed, 0);
});
test('resending a recording resets the socket buffer and sends every chunk before answer:end', () => {
  const events = [];
  const socket = { emit(...args) { events.push(args); } };
  const chunks = ['first', 'final'];
  const callback = () => {};
  resendAudioAnswer(socket, { interviewId: 2, turnId: 3, chunks, contentType: 'audio/webm', timedOut: false }, callback);
  assert.deepEqual(events.map(event => event[0]), ['answer:start', 'audio:chunk', 'audio:chunk', 'answer:end']);
  assert.equal(events[2][1].chunk, 'final');
  assert.equal(events[3][1].turnId, 3);
  assert.equal(events[3][2], callback);
});
