// STT adapter factory (Step 9).
// Returns MockSttAdapter for tests/offline mock mode, and LambdaSttAdapter
// (PhoWhisper via AWS Lambda / RIE) when provider is 'lambda' off mock mode.

const { createMockSttAdapter, MockSttAdapter } = require('./mockSttAdapter');
const { LambdaSttAdapter } = require('./lambdaSttAdapter');

function createSttAdapter(env = {}, deps = {}) {
  const provider = env.sttProvider || 'mock';
  if (env.awsMockMode || provider !== 'lambda') {
    return createMockSttAdapter();
  }
  return new LambdaSttAdapter({
    env,
    lambdaClient: deps.lambdaClient || (deps.awsClients && deps.awsClients.lambdaClient),
  });
}

module.exports = { createSttAdapter, MockSttAdapter, LambdaSttAdapter };
