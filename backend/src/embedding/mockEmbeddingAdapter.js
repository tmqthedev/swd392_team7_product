// Deterministic mock embedding adapter. Produces an L2-normalized 1024-length
// vector seeded from the normalized text so that:
//   - identical normalized text => identical vector (cosine 1.0)
//   - different text => different vector (cosine < 1.0)
// It uses a small xorshift PRNG seeded from a hash of the normalized text, so
// no network/model call is made. Step 4 can swap in a real Titan provider via
// the embeddingAdapter factory seam.

const EMBEDDING_DIMS = 1024;

function normalizeText(text) {
  return String(text ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

// FNV-1a 32-bit hash -> stable numeric seed from the normalized text.
function hashSeed(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  // Keep it a non-zero unsigned 32-bit value for the PRNG.
  return (hash >>> 0) || 1;
}

// Mulberry32: compact, deterministic PRNG producing floats in [0, 1).
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class MockEmbeddingAdapter {
  constructor({ dims = EMBEDDING_DIMS } = {}) {
    this.dims = dims;
  }

  async embed(text) {
    const normalized = normalizeText(text);
    const rand = mulberry32(hashSeed(normalized));
    const vector = new Array(this.dims);
    let magnitude = 0;
    for (let i = 0; i < this.dims; i += 1) {
      // Center around 0 so the vector points in a text-specific direction.
      const value = rand() - 0.5;
      vector[i] = value;
      magnitude += value * value;
    }
    magnitude = Math.sqrt(magnitude) || 1;
    for (let i = 0; i < this.dims; i += 1) {
      vector[i] /= magnitude;
    }
    return vector;
  }
}

function createMockEmbeddingAdapter(options = {}) {
  return new MockEmbeddingAdapter(options);
}

module.exports = {
  MockEmbeddingAdapter,
  createMockEmbeddingAdapter,
  normalizeText,
  EMBEDDING_DIMS,
};
