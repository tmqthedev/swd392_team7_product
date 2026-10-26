// LLM adapter factory. Selects an implementation from env so the rest of the
// app depends only on a { generateQuestions(...) } seam. Mock mode always wins
// first (offline/test boots never touch the network). Otherwise llmProvider
// chooses between the real Nova/Bedrock adapter and the deterministic mock.

const { createMockLlmAdapter } = require('./mockLlmAdapter');
const { createBedrockLlmAdapter } = require('./bedrockLlmAdapter');

function createLlmAdapter(env = {}) {
  // Mock mode is the offline/test default: never construct a real client.
  if (env.awsMockMode) {
    return createMockLlmAdapter();
  }
  const provider = env.llmProvider || 'bedrock';
  switch (provider) {
    case 'bedrock':
    case 'nova':
      return createBedrockLlmAdapter({ env });
    case 'mock':
      return createMockLlmAdapter();
    default:
      throw new Error('Invalid LLM_PROVIDER.');
  }
}

module.exports = { createLlmAdapter };
