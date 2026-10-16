// Deterministic in-memory TTS adapter for the offline/test path. Produces a
// stable audioKey from a sha256 of language + text with NO network or file I/O.
// Real Google TTS synthesis lands in Step 9; until then every environment that
// is not explicitly 'google' resolves to this mock.

const crypto = require('crypto');

function createMockTtsAdapter() {
  return {
    async synthesize({ text, language } = {}) {
      const digest = crypto
        .createHash('sha256')
        .update(`${language || ''}|${text || ''}`)
        .digest('hex');
      return { audioKey: `tts/${digest}.mp3`, cached: false };
    },
  };
}

module.exports = { createMockTtsAdapter };
