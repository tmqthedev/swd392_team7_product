// Kokoro TTS adapter backed by AWS Lambda (lambda/tts/), with S3 audio caching.
// Vietnamese uses the Kokoro-Vietnamese fine-tune, English stock Kokoro-82M.
// Invokes the Lambda function using InvokeCommand over AWS SDK; env.ttsLambdaEndpoint
// points it at a local Lambda Runtime Interface Emulator (RIE) instead.

const crypto = require('crypto');
const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');

// Voice names baked into the TTS image (lambda/tts/build_models.py).
const VOICES = {
  vi: { FEMALE: 'diem_trinh', MALE: 'thanh_dat' },
  en: { FEMALE: 'af_heart', MALE: 'am_michael' },
};

class KokoroTtsAdapter {
  constructor({ env = {}, awsClients = null, lambdaClient = null } = {}) {
    this.env = env;
    this.awsClients = awsClients;
    this.functionName = env.ttsLambdaFunctionName || 'aives-prod-tts';
    this.endpoint = env.ttsLambdaEndpoint || undefined;
    this.audioBucket = env.audioBucket || 'local-audio-bucket';
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

  _resolveVoice(language = 'vi', voiceGender = 'FEMALE') {
    const lang = String(language || 'vi').toLowerCase().startsWith('en') ? 'en' : 'vi';
    const gender = String(voiceGender || 'FEMALE').toUpperCase() === 'MALE' ? 'MALE' : 'FEMALE';
    return { language: lang, voice: VOICES[lang][gender] };
  }

  /**
   * Warm up the Lambda container and load the model for `language`. Never throws.
   */
  async warmUp(language = 'vi') {
    const startedAt = Date.now();
    const { language: lang } = this._resolveVoice(language);
    try {
      const response = await this._getClient().send(
        new InvokeCommand({
          FunctionName: this.functionName,
          InvocationType: 'RequestResponse',
          Payload: Buffer.from(JSON.stringify({ action: 'warmup', language: lang })),
        }),
      );
      if (response.FunctionError) {
        const errPayload = response.Payload ? Buffer.from(response.Payload).toString('utf8') : '';
        return { ok: false, language: lang, ms: Date.now() - startedAt, error: `${response.FunctionError} - ${errPayload}` };
      }
      return { ok: true, language: lang, ms: Date.now() - startedAt };
    } catch (err) {
      return { ok: false, language: lang, ms: Date.now() - startedAt, error: err.message };
    }
  }

  /**
   * Compute deterministic S3 cache key for text, language, and voice.
   */
  _computeCacheKey(text, language, voice) {
    const hash = crypto
      .createHash('sha256')
      .update(`kokoro:${language}:${voice}:${text.trim()}`)
      .digest('hex');
    return `tts-cache/${hash}.wav`;
  }

  /**
   * Synthesize text to speech with transparent S3 caching.
   *
   * @param {{
   *   text: string,
   *   language?: string,
   *   voiceGender?: 'MALE'|'FEMALE'
   * }} params
   * @returns {Promise<{
   *   audioBuffer: Buffer,
   *   audioKey: string,
   *   contentType: string,
   *   cached: boolean
   * }>}
   */
  async synthesize({ text, language = 'vi', voiceGender = 'FEMALE' } = {}) {
    const normalizedText = String(text || '').trim();
    if (!normalizedText) {
      return {
        audioBuffer: Buffer.alloc(0),
        audioKey: 'tts-cache/empty.wav',
        contentType: 'audio/wav',
        cached: true,
      };
    }

    const { language: lang, voice } = this._resolveVoice(language, voiceGender);
    const cacheKey = this._computeCacheKey(normalizedText, lang, voice);

    // 1. Check S3 Cache first
    if (this.awsClients && typeof this.awsClients.getObject === 'function') {
      try {
        const cached = await this.awsClients.getObject({
          bucket: this.audioBucket,
          key: cacheKey,
        });
        if (cached && cached.length > 0) {
          return {
            audioBuffer: cached,
            audioKey: cacheKey,
            contentType: 'audio/wav',
            cached: true,
          };
        }
      } catch {
        // Cache miss -> proceed to Lambda synthesis
      }
    }

    // 2. Invoke the Kokoro Lambda
    const response = await this._getClient().send(
      new InvokeCommand({
        FunctionName: this.functionName,
        InvocationType: 'RequestResponse',
        Payload: Buffer.from(JSON.stringify({ text: normalizedText, language: lang, voice })),
      }),
    );

    if (response.FunctionError) {
      const errPayload = response.Payload ? Buffer.from(response.Payload).toString('utf8') : '';
      const err = new Error(`Lambda TTS function error: ${response.FunctionError} - ${errPayload}`);
      err.code = 'TTS_SYNTHESIS_FAILED';
      err.statusCode = 502;
      throw err;
    }

    let data = {};
    try {
      data = JSON.parse(Buffer.from(response.Payload || []).toString('utf8'));
    } catch {}

    if (!data.audio_base64) {
      const err = new Error('Lambda TTS returned empty audio_base64.');
      err.code = 'TTS_EMPTY_RESPONSE';
      err.statusCode = 502;
      throw err;
    }

    const audioBuffer = Buffer.from(data.audio_base64, 'base64');
    const contentType = data.content_type || 'audio/wav';

    // 3. Save into S3 Cache
    if (this.awsClients && typeof this.awsClients.putObject === 'function') {
      try {
        await this.awsClients.putObject({
          bucket: this.audioBucket,
          key: cacheKey,
          body: audioBuffer,
          contentType,
        });
      } catch (cacheErr) {
        // Cache save failure is non-fatal
      }
    }

    return {
      audioBuffer,
      audioKey: cacheKey,
      contentType,
      cached: false,
    };
  }
}

module.exports = {
  KokoroTtsAdapter,
};
