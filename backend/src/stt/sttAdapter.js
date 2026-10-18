// STT adapter factory (Step 6). Mirrors tts/ttsAdapter.js: the rest of the app
// depends only on a { transcribe({ audio, contentType, language, hints }) ->
// { text, confidence, words[], durationMs } } seam. Mock mode always wins
// first so offline/test boots never touch the network. The 'lambda' branch
// (PhoWhisper behind LAMBDA_ENDPOINT) is reserved for Step 9 and throws
// NOT_IMPLEMENTED today; it must never call out.

const { createMockSttAdapter } = require('./mockSttAdapter');

function createSttAdapter(env = {}) {
  const provider = env.sttProvider || 'mock';
  if (env.awsMockMode || provider !== 'lambda') {
    return createMockSttAdapter();
  }
  return {
    async transcribe() {
      const err = new Error('Lambda STT is not implemented yet (reserved for Step 9).');
      err.code = 'NOT_IMPLEMENTED';
      err.statusCode = 501;
      throw err;
    },
  };
}

module.exports = { createSttAdapter };
