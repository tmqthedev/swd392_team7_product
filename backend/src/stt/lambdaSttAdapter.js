// Real STT adapter backed by AWS Lambda running PhoWhisper (Step 9).
// Invokes the Lambda function using InvokeCommand over AWS SDK.
// Supports both direct AWS invocation and local Lambda Runtime Interface Emulator (RIE) via env.lambdaEndpoint.

const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');

class LambdaSttAdapter {
  constructor({ env = {}, lambdaClient = null } = {}) {
    this.env = env;
    this.functionName = env.lambdaFunctionName || 'audio-orchestrator';
    this.endpoint = env.lambdaEndpoint || undefined;
    this._client = lambdaClient;
  }

  _getClient() {
    if (!this._client) {
      this._client = new LambdaClient({
        region: this.env.awsRegion || 'ap-southeast-1',
        ...(this.endpoint ? { endpoint: this.endpoint } : {}),
      });
    }
    return this._client;
  }

  /**
   * Transcribe an audio recording into text, confidence score, and word timings.
   *
   * @param {{
   *   audio: Buffer|string,
   *   contentType?: string,
   *   language?: string,
   *   hints?: string[]
   * }} params
   * @returns {Promise<{
   *   text: string,
   *   confidence: number,
   *   words: Array<{ word: string, startMs: number, endMs: number, confidence: number }>,
   *   durationMs: number
   * }>}
   */
  async transcribe({ audio, contentType = 'audio/webm', language = 'vi', hints = [] } = {}) {
    if (!audio || (Buffer.isBuffer(audio) && audio.length === 0)) {
      return { text: '', confidence: 0, words: [], durationMs: 0 };
    }

    const audioBase64 = Buffer.isBuffer(audio)
      ? audio.toString('base64')
      : String(audio);

    const payload = {
      audio_base64: audioBase64,
      content_type: contentType,
      language: String(language || 'vi').toLowerCase().startsWith('en') ? 'en' : 'vi',
      hints: Array.isArray(hints) ? hints : [],
    };

    const client = this._getClient();
    const command = new InvokeCommand({
      FunctionName: this.functionName,
      InvocationType: 'RequestResponse',
      Payload: Buffer.from(JSON.stringify(payload)),
    });

    const response = await client.send(command);

    if (response.FunctionError) {
      const errPayload = response.Payload ? Buffer.from(response.Payload).toString('utf8') : '';
      const err = new Error(`Lambda STT function error: ${response.FunctionError} - ${errPayload}`);
      err.code = 'STT_FUNCTION_ERROR';
      throw err;
    }

    if (!response.Payload) {
      return { text: '', confidence: 0, words: [], durationMs: 0 };
    }

    const raw = Buffer.from(response.Payload).toString('utf8');
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      data = { text: raw };
    }

    if (data.body && typeof data.body === 'string') {
      try {
        data = JSON.parse(data.body);
      } catch {}
    }

    const text = String(data.text || '').trim();
    const confidence = typeof data.confidence === 'number' ? data.confidence : (text ? 0.92 : 0);
    const durationMs = typeof data.duration === 'number'
      ? Math.round(data.duration * 1000)
      : (typeof data.durationMs === 'number' ? data.durationMs : 0);

    const words = Array.isArray(data.words)
      ? data.words.map((w) => ({
          word: String(w.word || ''),
          startMs: Math.round((w.start ?? w.startMs ?? 0) * (w.startMs !== undefined ? 1 : 1000)),
          endMs: Math.round((w.end ?? w.endMs ?? 0) * (w.endMs !== undefined ? 1 : 1000)),
          confidence: Number(w.confidence ?? w.probability ?? confidence),
        }))
      : [];

    return {
      text,
      confidence,
      words,
      durationMs: durationMs || (words.length > 0 ? words[words.length - 1].endMs : 0),
    };
  }

  /**
   * Warm up the Lambda container to eliminate cold start latency.
   */
  async warmUp() {
    try {
      const client = this._getClient();
      await client.send(
        new InvokeCommand({
          FunctionName: this.functionName,
          InvocationType: 'RequestResponse',
          Payload: Buffer.from(JSON.stringify({ action: 'warmup' })),
        })
      );
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }
}

module.exports = {
  LambdaSttAdapter,
};
