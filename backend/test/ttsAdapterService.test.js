const test = require('node:test');
const assert = require('node:assert/strict');
const { createTtsAdapter } = require('../src/tts/ttsAdapter');
const { createMockTtsAdapter } = require('../src/tts/mockTtsAdapter');

test('mock adapter produces a stable audioKey for the same text/language', async () => {
  const adapter = createMockTtsAdapter();
  const a = await adapter.synthesize({ text: 'What is a mutex?', language: 'EN' });
  const b = await adapter.synthesize({ text: 'What is a mutex?', language: 'EN' });
  assert.equal(a.audioKey, b.audioKey);
  assert.match(a.audioKey, /^tts\/[0-9a-f]{64}\.mp3$/);
  assert.equal(a.cached, false);
});

test('mock adapter produces distinct keys for different text or language', async () => {
  const adapter = createMockTtsAdapter();
  const base = await adapter.synthesize({ text: 'Q1', language: 'EN' });
  const otherText = await adapter.synthesize({ text: 'Q2', language: 'EN' });
  const otherLang = await adapter.synthesize({ text: 'Q1', language: 'VI' });
  assert.notEqual(base.audioKey, otherText.audioKey);
  assert.notEqual(base.audioKey, otherLang.audioKey);
});

test('createTtsAdapter returns the mock when awsMockMode is true', async () => {
  const adapter = createTtsAdapter({ awsMockMode: true, ttsProvider: 'google' });
  const result = await adapter.synthesize({ text: 'x', language: 'EN' });
  assert.match(result.audioKey, /^tts\//);
});

test('createTtsAdapter returns the mock for a non-google provider off mock mode', async () => {
  const adapter = createTtsAdapter({ awsMockMode: false, ttsProvider: 'mock' });
  const result = await adapter.synthesize({ text: 'x', language: 'EN' });
  assert.match(result.audioKey, /^tts\//);
});

test('createTtsAdapter google provider off mock throws NOT_IMPLEMENTED and never calls out', async () => {
  const adapter = createTtsAdapter({ awsMockMode: false, ttsProvider: 'google' });
  await assert.rejects(
    () => adapter.synthesize({ text: 'x', language: 'EN' }),
    (error) => {
      assert.equal(error.code, 'NOT_IMPLEMENTED');
      return true;
    },
  );
});
