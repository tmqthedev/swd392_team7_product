// Embedding adapter factory. Selects an implementation from env so the rest of
// the app depends only on an { embed(text) } seam. Mock mode always wins first
// (offline/test boots never touch the network). Otherwise the embeddingProvider
// chooses between the real Titan/Bedrock adapter and the deterministic mock.

const { createMockEmbeddingAdapter } = require('./mockEmbeddingAdapter');
const { createBedrockEmbeddingAdapter } = require('./bedrockEmbeddingAdapter');

function createEmbeddingAdapter(env = {}) {
  // Mock mode is the offline/test default: never construct a real client.
  if (env.awsMockMode) {
    return createMockEmbeddingAdapter();
  }
  const provider = env.embeddingProvider || 'mock';
  switch (provider) {
    case 'bedrock':
    case 'titan':
      return createBedrockEmbeddingAdapter({ env });
    case 'mock':
      return createMockEmbeddingAdapter();
    default:
      // Unknown provider: fall back to the mock so boots never fail.
      return createMockEmbeddingAdapter();
  }
}

module.exports = { createEmbeddingAdapter };
