// Embedding adapter factory. Selects an implementation from env so the rest of
// the app depends only on an { embed(text) } seam. Today only the deterministic
// mock exists; Step 4 can register a real Titan provider here without touching
// callers. Defaults to the mock when env.embeddingProvider is 'mock' or unset.

const { createMockEmbeddingAdapter } = require('./mockEmbeddingAdapter');

function createEmbeddingAdapter(env = {}) {
  const provider = env.embeddingProvider || 'mock';
  switch (provider) {
    case 'mock':
      return createMockEmbeddingAdapter();
    default:
      // Unknown provider: fall back to the mock so mock/test boots never fail.
      return createMockEmbeddingAdapter();
  }
}

module.exports = { createEmbeddingAdapter };
