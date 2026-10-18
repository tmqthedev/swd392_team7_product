// Pure computation of speech signals for qa_turn.
// Signals:
// - response_latency_ms: time between question played and student answer start (ms)
// - speech_duration_ms: duration of answer speaking (ms)
// - words_per_minute: speech rate (words / minute)
// - pause_count: count of pauses > 2 seconds

function calculateSpeechSignals({
  playedAt = null,
  answerStartedAt = null,
  answerEndedAt = null,
  words = [],
  text = '',
} = {}) {
  let responseLatencyMs = null;
  const pTime = playedAt ? new Date(playedAt).getTime() : null;
  const sTime = answerStartedAt ? new Date(answerStartedAt).getTime() : null;
  const eTime = answerEndedAt ? new Date(answerEndedAt).getTime() : null;

  if (pTime != null && sTime != null) {
    responseLatencyMs = Math.max(0, sTime - pTime);
  }

  let speechDurationMs = null;
  if (sTime != null && eTime != null) {
    speechDurationMs = Math.max(0, eTime - sTime);
  }

  // Count words: either from words array (timestamps) or from text string
  let wordCount = 0;
  if (Array.isArray(words) && words.length > 0) {
    wordCount = words.length;
  } else if (typeof text === 'string' && text.trim().length > 0) {
    wordCount = text.trim().split(/\s+/).length;
  }

  let wordsPerMinute = null;
  if (speechDurationMs != null && speechDurationMs > 0 && wordCount > 0) {
    const minutes = speechDurationMs / 60000;
    wordsPerMinute = Math.round((wordCount / minutes) * 100) / 100;
  } else if (wordCount === 0 && speechDurationMs != null) {
    wordsPerMinute = 0;
  }

  // Count pauses > 2 seconds (2000 ms) from word-level timestamps if available:
  // words is an array of { word, start, end } with timestamps in seconds or ms.
  let pauseCount = 0;
  if (Array.isArray(words) && words.length > 1) {
    for (let i = 0; i < words.length - 1; i += 1) {
      const current = words[i];
      const next = words[i + 1];
      if (current && next && current.end != null && next.start != null) {
        // Normalize to ms if seconds (< 1000)
        const endMs = current.end < 1000 ? current.end * 1000 : current.end;
        const startMs = next.start < 1000 ? next.start * 1000 : next.start;
        const gap = startMs - endMs;
        if (gap >= 2000) {
          pauseCount += 1;
        }
      }
    }
  }

  return {
    responseLatencyMs,
    speechDurationMs,
    wordsPerMinute,
    pauseCount,
  };
}

module.exports = { calculateSpeechSignals };
