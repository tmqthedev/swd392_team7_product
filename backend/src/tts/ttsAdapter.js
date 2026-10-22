// TTS adapter factory (Step 9).
// Returns MockTtsAdapter for tests/offline mock mode, GoogleTtsAdapter
// (Google Cloud Text-to-Speech) when provider is 'google', and KokoroTtsAdapter
// (Kokoro-82M via AWS Lambda / RIE) when provider is 'kokoro', off mock mode.

const { createMockTtsAdapter, MockTtsAdapter } = require('./mockTtsAdapter');
const { GoogleTtsAdapter } = require('./googleTtsAdapter');
const { KokoroTtsAdapter } = require('./kokoroTtsAdapter');

function createTtsAdapter(env = {}, deps = {}) {
  const provider = env.ttsProvider || 'mock';
  if (env.awsMockMode || (provider !== 'google' && provider !== 'kokoro')) {
    return createMockTtsAdapter();
  }
  if (provider === 'kokoro') {
    return new KokoroTtsAdapter({
      env,
      awsClients: deps.awsClients,
      lambdaClient: deps.lambdaClient,
    });
  }
  return new GoogleTtsAdapter({
    env,
    awsClients: deps.awsClients,
    fetchFn: deps.fetchFn,
  });
}

module.exports = { createTtsAdapter, MockTtsAdapter, GoogleTtsAdapter, KokoroTtsAdapter };
