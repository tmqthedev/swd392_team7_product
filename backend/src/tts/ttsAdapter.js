// TTS adapter factory (Step 9).
// Returns MockTtsAdapter for tests/offline mock mode, and GoogleTtsAdapter
// (Google Cloud Text-to-Speech) when provider is 'google' off mock mode.

const { createMockTtsAdapter, MockTtsAdapter } = require('./mockTtsAdapter');
const { GoogleTtsAdapter } = require('./googleTtsAdapter');

function createTtsAdapter(env = {}, deps = {}) {
  const provider = env.ttsProvider || 'mock';
  if (env.awsMockMode || provider !== 'google') {
    return createMockTtsAdapter();
  }
  return new GoogleTtsAdapter({
    env,
    awsClients: deps.awsClients,
    fetchFn: deps.fetchFn,
  });
}

module.exports = { createTtsAdapter, MockTtsAdapter, GoogleTtsAdapter };
