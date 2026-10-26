const test = require('node:test');
const assert = require('node:assert/strict');
const { createSttAdapter } = require('../src/stt/sttAdapter');
const { MockSttAdapter } = require('../src/stt/mockSttAdapter');

test('createSttAdapter returns the mock in AWS mock mode even when provider is lambda', () => {
  const adapter = createSttAdapter({ awsMockMode: true, sttProvider: 'lambda' });
  assert.ok(adapter instanceof MockSttAdapter);
});

test('createSttAdapter returns the mock for mock or unknown providers off mock mode', () => {
  assert.ok(createSttAdapter({ awsMockMode: false, sttProvider: 'mock' }) instanceof MockSttAdapter);
  assert.throws(() => createSttAdapter({ awsMockMode: false, sttProvider: 'whatever' }), /Invalid/);
  assert.equal(createSttAdapter({ awsMockMode: false }).constructor.name, 'LambdaSttAdapter');
});

test('createSttAdapter lambda provider off mock returns LambdaSttAdapter', () => {
  const { LambdaSttAdapter } = require('../src/stt/lambdaSttAdapter');
  const adapter = createSttAdapter({ awsMockMode: false, sttProvider: 'lambda' });
  assert.ok(adapter instanceof LambdaSttAdapter);
});

test('mock decodes the buffer text deterministically with words and confidence', async () => {
  const stt = new MockSttAdapter();
  const a = await stt.transcribe({ audio: Buffer.from('xin chào thầy cô'), language: 'VI' });
  const b = await stt.transcribe({ audio: Buffer.from('xin chào thầy cô'), language: 'VI' });
  assert.deepEqual(a, b);
  assert.equal(a.text, 'xin chào thầy cô');
  assert.equal(a.confidence, 0.95);
  assert.equal(a.words.length, 4);
  assert.deepEqual(a.words[1], { word: 'chào', startMs: 500, endMs: 900 });
  assert.equal(a.durationMs, a.words[3].endMs);
});

test('mock returns a queued result first, then falls back to the buffer', async () => {
  const stt = new MockSttAdapter();
  stt.enqueueResult({ text: 'queued text', confidence: 0.42 });
  const first = await stt.transcribe({ audio: Buffer.from('from buffer') });
  assert.equal(first.text, 'queued text');
  assert.equal(first.confidence, 0.42);
  assert.equal(first.words.length, 2);
  const second = await stt.transcribe({ audio: Buffer.from('from buffer') });
  assert.equal(second.text, 'from buffer');
});

test('mock returns an empty transcript for an empty or absent buffer', async () => {
  const stt = new MockSttAdapter();
  assert.deepEqual(await stt.transcribe({ audio: Buffer.alloc(0) }), {
    text: '', confidence: 0, words: [], durationMs: 0,
  });
  assert.equal((await stt.transcribe({})).text, '');
});
