// Deterministic in-memory STT adapter for the offline/test path (Step 6). No
// network or file I/O. Tests either queue an explicit result (text + optional
// confidence / word timings) or send the "audio" as UTF-8 text, which is
// echoed back as the transcript with synthetic word timings. Real PhoWhisper
// via Lambda lands in Step 9.

const WORD_MS = 400;
const GAP_MS = 100;

function synthesizeWords(text) {
  const tokens = String(text).trim().split(/\s+/).filter((w) => w !== '');
  return tokens.map((word, i) => {
    const startMs = i * (WORD_MS + GAP_MS);
    return { word, startMs, endMs: startMs + WORD_MS };
  });
}

class MockSttAdapter {
  constructor() {
    this.queue = [];
  }

  // Queue a result returned by the next transcribe() call (FIFO).
  enqueueResult(result) {
    this.queue.push(result);
  }

  async transcribe({ audio } = {}) {
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      const text = String(next.text ?? '');
      const words = Array.isArray(next.words) ? next.words : synthesizeWords(text);
      return {
        text,
        confidence: next.confidence ?? (text.trim() === '' ? 0 : 0.95),
        words,
        durationMs: next.durationMs ?? (words.length > 0 ? words[words.length - 1].endMs : 0),
      };
    }
    const text = Buffer.isBuffer(audio) ? audio.toString('utf8').trim() : '';
    if (text === '') {
      return {
        text: '', confidence: 0, words: [], durationMs: 0,
      };
    }
    const words = synthesizeWords(text);
    return {
      text,
      confidence: 0.95,
      words,
      durationMs: words[words.length - 1].endMs,
    };
  }
}

function createMockSttAdapter() {
  return new MockSttAdapter();
}

module.exports = { MockSttAdapter, createMockSttAdapter };
