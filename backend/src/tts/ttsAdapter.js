// TTS adapter factory. Mirrors embeddingAdapter/llmAdapter: the rest of the app
// depends only on a { synthesize({text,language}) } seam. Mock mode always wins
// first so offline/test boots never touch the network. The 'google' branch is
// reserved for Step 9 and throws NOT_IMPLEMENTED today — it must never call out.

const { createMockTtsAdapter } = require('./mockTtsAdapter');

function createTtsAdapter(env = {}) {
  const provider = env.ttsProvider || 'mock';
  // Mock mode (offline/test default) or any non-google provider => mock.
  if (env.awsMockMode || provider !== 'google') {
    return createMockTtsAdapter();
  }
  // provider === 'google': real synthesis is Step 9; never call out yet.
  return {
    async synthesize() {
      const err = new Error('Google TTS synthesis is not implemented yet (reserved for Step 9).');
      err.code = 'NOT_IMPLEMENTED';
      err.statusCode = 501;
      throw err;
    },
  };
}

module.exports = { createTtsAdapter };
