// Real embedding adapter backed by Amazon Titan Text Embeddings v2 on Bedrock.
// Exposes the same { embed(text) -> number[1024] } seam as the mock, so the
// factory can swap it in behind env without touching callers. Never selected in
// mock mode (the factory short-circuits to the mock first); constructing the
// BedrockRuntimeClient is lazy so requiring this module makes no network call.

const EMBEDDING_DIMS = 1024;
const DEFAULT_MODEL_ID = 'amazon.titan-embed-text-v2:0';

class BedrockEmbeddingAdapter {
  constructor({ env = {} } = {}) {
    this.env = env;
    this.modelId = env.bedrockEmbedModelId || DEFAULT_MODEL_ID;
    this.dims = EMBEDDING_DIMS;
    this._client = null;
    this._InvokeModelCommand = null;
  }

  _ensureClient() {
    if (this._client) return;
    // Require lazily so the SDK is only loaded when a real embed is requested.
    const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');
    this._client = new BedrockRuntimeClient({ region: this.env.awsRegion });
    this._InvokeModelCommand = InvokeModelCommand;
  }

  async embed(text) {
    this._ensureClient();
    const body = JSON.stringify({
      inputText: String(text ?? ''),
      dimensions: this.dims,
      normalize: true,
    });
    const response = await this._client.send(
      new this._InvokeModelCommand({
        modelId: this.modelId,
        contentType: 'application/json',
        accept: 'application/json',
        body,
      }),
    );
    const decoded = JSON.parse(Buffer.from(response.body).toString('utf8'));
    const embedding = decoded && decoded.embedding;
    if (!Array.isArray(embedding) || embedding.length !== this.dims) {
      throw new Error(
        `Titan embedding returned ${Array.isArray(embedding) ? embedding.length : 'no'} dims; expected ${this.dims}.`,
      );
    }
    return embedding;
  }
}

function createBedrockEmbeddingAdapter(options = {}) {
  return new BedrockEmbeddingAdapter(options);
}

module.exports = {
  BedrockEmbeddingAdapter,
  createBedrockEmbeddingAdapter,
  EMBEDDING_DIMS,
  DEFAULT_MODEL_ID,
};
