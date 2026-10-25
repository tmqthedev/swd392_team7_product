const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateSpeechSignals } = require('../src/services/speechSignals');

test('calculateSpeechSignals computes latency, duration, WPM and pauses correctly', () => {
  const playedAt = new Date('2026-10-18T10:00:00.000Z');
  const answerStartedAt = new Date('2026-10-18T10:00:03.500Z'); // 3500 ms latency
  const answerEndedAt = new Date('2026-10-18T10:00:33.500Z'); // 30000 ms duration (0.5 min)

  const words = [
    { word: 'Hello', start: 0.0, end: 0.5 },
    { word: 'world', start: 0.6, end: 1.0 },
    { word: 'this', start: 3.5, end: 4.0 }, // gap: 3.5 - 1.0 = 2.5s >= 2s (pause 1)
    { word: 'is', start: 4.2, end: 4.5 },
    { word: 'test', start: 7.0, end: 7.5 }, // gap: 7.0 - 4.5 = 2.5s >= 2s (pause 2)
  ];

  const signals = calculateSpeechSignals({
    playedAt,
    answerStartedAt,
    answerEndedAt,
    words,
  });

  assert.equal(signals.responseLatencyMs, 3500);
  assert.equal(signals.speechDurationMs, 30000);
  assert.equal(signals.pauseCount, 2);
  assert.equal(signals.pause_count, 2);
  // 5 words in 0.5 min = 10 words per minute
  assert.equal(signals.wordsPerMinute, 10);
});

test('calculateSpeechSignals handles missing dates gracefully', () => {
  const signals = calculateSpeechSignals({});
  assert.equal(signals.responseLatencyMs, null);
  assert.equal(signals.speechDurationMs, null);
  assert.equal(signals.wordsPerMinute, null);
  assert.equal(signals.pauseCount, 0);
});

test('calculateSpeechSignals calculates WPM from text fallback when words array is empty', () => {
  const answerStartedAt = new Date('2026-10-18T10:00:00.000Z');
  const answerEndedAt = new Date('2026-10-18T10:01:00.000Z'); // 1 minute
  const text = 'one two three four five six seven eight nine ten';

  const signals = calculateSpeechSignals({
    answerStartedAt,
    answerEndedAt,
    text,
  });

  assert.equal(signals.speechDurationMs, 60000);
  assert.equal(signals.wordsPerMinute, 10);
  assert.equal(signals.pauseCount, 0);
});
