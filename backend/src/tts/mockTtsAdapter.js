// Deterministic in-memory TTS adapter for the offline/test path. Produces a
// stable audioKey from a sha256 of language + text with NO network or file I/O.

const crypto = require('crypto');

class MockTtsAdapter {
  async warmUp(language = 'vi') {
    return { ok: true, language, ms: 0, mock: true };
  }

  async synthesize({ text, language } = {}) {
    const digest = crypto
      .createHash('sha256')
      .update(`${language || ''}|${text || ''}`)
      .digest('hex');
    return {
      audioKey: `tts/${digest}.mp3`,
      cached: false,
      contentType: 'audio/mp3',
      audioBuffer: Buffer.alloc(128),
    };
  }
}

function createMockTtsAdapter() {
  return new MockTtsAdapter();
}

module.exports = { createMockTtsAdapter, MockTtsAdapter };
