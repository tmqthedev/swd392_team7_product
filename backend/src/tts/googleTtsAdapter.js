// Google Cloud Text-to-Speech adapter (Step 9).
// Synthesizes speech using Google Cloud TTS (Neural2 / Chirp) with S3 audio caching.
// Supported languages: Vietnamese (vi-VN) and English (en-US).

const crypto = require('crypto');

class GoogleTtsAdapter {
  constructor({ env = {}, awsClients = null, fetchFn = null } = {}) {
    this.env = env;
    this.awsClients = awsClients;
    this.fetch = fetchFn || globalThis.fetch;
    this.apiKey = env.googleTtsApiKey
      || process.env.GOOGLE_TTS_API_KEY
      || process.env.GEMINI_API_KEY
      || process.env.GOOGLE_API_KEY
      || '';
    this.audioBucket = env.audioBucket || 'local-audio-bucket';
  }

  // Google Cloud TTS is a managed API: nothing to warm.
  async warmUp(language = 'vi') {
    return { ok: true, language, ms: 0, skipped: true };
  }

  /**
   * Determine language code and high-quality voice for the specified language.
   */
  _resolveVoice(language = 'vi', voiceGender = 'FEMALE') {
    const lang = String(language || 'vi').toLowerCase();
    const gender = String(voiceGender || 'FEMALE').toUpperCase() === 'MALE' ? 'MALE' : 'FEMALE';

    if (lang.startsWith('vi')) {
      return {
        languageCode: 'vi-VN',
        name: gender === 'MALE' ? 'vi-VN-Neural2-D' : 'vi-VN-Neural2-A',
        ssmlGender: gender,
      };
    }

    return {
      languageCode: 'en-US',
      name: gender === 'MALE' ? 'en-US-Neural2-D' : 'en-US-Neural2-F',
      ssmlGender: gender,
    };
  }

  /**
   * Compute deterministic S3 cache key for text, language, and voice.
   */
  _computeCacheKey(text, languageCode, voiceName) {
    const hash = crypto
      .createHash('sha256')
      .update(`${languageCode}:${voiceName}:${text.trim()}`)
      .digest('hex');
    return `tts-cache/${hash}.mp3`;
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
        audioKey: 'tts-cache/empty.mp3',
        contentType: 'audio/mp3',
        cached: true,
      };
    }

    const voice = this._resolveVoice(language, voiceGender);
    const cacheKey = this._computeCacheKey(normalizedText, voice.languageCode, voice.name);

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
            contentType: 'audio/mp3',
            cached: true,
          };
        }
      } catch {
        // Cache miss -> proceed to external API synthesis
      }
    }

    // 2. Call Google Cloud TTS API
    if (!this.apiKey) {
      const err = new Error(
        'GOOGLE_TTS_API_KEY (or GEMINI_API_KEY / GOOGLE_API_KEY) is not configured.'
      );
      err.code = 'TTS_API_KEY_MISSING';
      err.statusCode = 500;
      throw err;
    }

    const endpoint = `https://texttospeech.googleapis.com/v1/text:synthesize?key=${this.apiKey}`;
    const payload = {
      input: { text: normalizedText },
      voice: {
        languageCode: voice.languageCode,
        name: voice.name,
        ssmlGender: voice.ssmlGender,
      },
      audioConfig: {
        audioEncoding: 'MP3',
        speakingRate: 1.0,
        pitch: 0.0,
      },
    };

    const res = await this.fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errBody = await res.text();
      const err = new Error(`Google TTS API failed with status ${res.status}: ${errBody}`);
      err.code = 'TTS_SYNTHESIS_FAILED';
      err.statusCode = res.status;
      throw err;
    }

    const data = await res.json();
    if (!data.audioContent) {
      const err = new Error('Google TTS API returned empty audioContent.');
      err.code = 'TTS_EMPTY_RESPONSE';
      err.statusCode = 502;
      throw err;
    }

    const audioBuffer = Buffer.from(data.audioContent, 'base64');

    // 3. Save into S3 Cache
    if (this.awsClients && typeof this.awsClients.putObject === 'function') {
      try {
        await this.awsClients.putObject({
          bucket: this.audioBucket,
          key: cacheKey,
          body: audioBuffer,
          contentType: 'audio/mp3',
        });
      } catch (cacheErr) {
        // Cache save failure is non-fatal
      }
    }

    return {
      audioBuffer,
      audioKey: cacheKey,
      contentType: 'audio/mp3',
      cached: false,
    };
  }
}

module.exports = {
  GoogleTtsAdapter,
};
