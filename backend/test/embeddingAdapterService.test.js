const test = require('node:test');
const assert = require('node:assert/strict');
const { createEmbeddingAdapter } = require('../src/embedding/embeddingAdapter');
const { MockEmbeddingAdapter } = require('../src/embedding/mockEmbeddingAdapter');
const { BedrockEmbeddingAdapter } = require('../src/embedding/bedrockEmbeddingAdapter');

test('factory returns the mock when awsMockMode is on, regardless of provider', () => {
  const adapter = createEmbeddingAdapter({ awsMockMode: true, embeddingProvider: 'bedrock' });
  assert.ok(adapter instanceof MockEmbeddingAdapter);
});

test('factory permits explicit test mock and rejects an unknown provider', () => {
  assert.ok(
    createEmbeddingAdapter({ awsMockMode: false, embeddingProvider: 'mock' })
      instanceof MockEmbeddingAdapter,
  );
  assert.throws(() => createEmbeddingAdapter({ awsMockMode: false, embeddingProvider: 'nope' }), /Invalid/);
});

test('factory selects the Bedrock adapter for bedrock/titan when mock mode is off', () => {
  assert.ok(
    createEmbeddingAdapter({ awsMockMode: false, embeddingProvider: 'bedrock' })
      instanceof BedrockEmbeddingAdapter,
  );
  assert.ok(
    createEmbeddingAdapter({ awsMockMode: false, embeddingProvider: 'titan' })
      instanceof BedrockEmbeddingAdapter,
  );
});

test('mock embeddings are deterministic, 1024-dim, and text-specific (no network)', async () => {
  const adapter = createEmbeddingAdapter({ awsMockMode: true });
  const a1 = await adapter.embed('What is polymorphism?');
  const a2 = await adapter.embed('What is polymorphism?');
  const b = await adapter.embed('Explain threads.');

  assert.equal(a1.length, 1024);
  assert.deepEqual(a1, a2); // identical text -> identical vector
  assert.notDeepEqual(a1, b); // different text -> different vector
});

test('constructing the Bedrock adapter makes no network call (lazy client)', () => {
  // Should not throw and should not require any AWS credentials/region call.
  const adapter = new BedrockEmbeddingAdapter({ env: { awsRegion: 'ap-southeast-1' } });
  assert.equal(adapter.modelId, 'amazon.titan-embed-text-v2:0');
  assert.equal(adapter._client, null);
});
