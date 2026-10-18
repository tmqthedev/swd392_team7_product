const test = require('node:test');
const assert = require('node:assert/strict');
const { GoogleTtsAdapter } = require('../src/tts/googleTtsAdapter');

test('GoogleTtsAdapter returns empty buffer for empty text', async () => {
  const adapter = new GoogleTtsAdapter();
  const res = await adapter.synthesize({ text: '' });
  assert.equal(res.audioBuffer.length, 0);
  assert.equal(res.cached, true);
});

test('GoogleTtsAdapter returns cached audio from S3 when available', async () => {
  const cachedBuffer = Buffer.from('cached-mp3-bytes');
  let s3GetCalled = false;
  let apiCalled = false;

  const mockAwsClients = {
    getObject: async ({ bucket, key }) => {
      s3GetCalled = true;
      assert.equal(bucket, 'test-bucket');
      assert.match(key, /^tts-cache\/[0-9a-f]{64}\.mp3$/);
      return cachedBuffer;
    },
    putObject: async () => {
      assert.fail('putObject should not be called on cache hit');
    },
  };

  const adapter = new GoogleTtsAdapter({
    env: { audioBucket: 'test-bucket', googleTtsApiKey: 'fake-key' },
    awsClients: mockAwsClients,
    fetchFn: async () => {
      apiCalled = true;
      return { ok: true, json: async () => ({}) };
    },
  });

  const res = await adapter.synthesize({ text: 'Xin chào', language: 'vi' });
  assert.equal(s3GetCalled, true);
  assert.equal(apiCalled, false);
  assert.equal(res.cached, true);
  assert.deepEqual(res.audioBuffer, cachedBuffer);
  assert.match(res.audioKey, /^tts-cache\/[0-9a-f]{64}\.mp3$/);
});

test('GoogleTtsAdapter calls Google TTS API on cache miss and stores to S3', async () => {
  const apiAudioBytes = Buffer.from('new-synthesized-mp3');
  let s3PutCalled = false;
  let sentPayload = null;

  const mockAwsClients = {
    getObject: async () => {
      const err = new Error('NoSuchKey');
      err.code = 'NoSuchKey';
      throw err;
    },
    putObject: async ({ bucket, key, body, contentType }) => {
      s3PutCalled = true;
      assert.equal(bucket, 'test-bucket');
      assert.match(key, /^tts-cache\/[0-9a-f]{64}\.mp3$/);
      assert.deepEqual(body, apiAudioBytes);
      assert.equal(contentType, 'audio/mp3');
    },
  };

  const mockFetch = async (url, options) => {
    assert.match(url, /texttospeech\.googleapis\.com\/v1\/text:synthesize\?key=test-api-key/);
    sentPayload = JSON.parse(options.body);
    return {
      ok: true,
      json: async () => ({
        audioContent: apiAudioBytes.toString('base64'),
      }),
    };
  };

  const adapter = new GoogleTtsAdapter({
    env: { audioBucket: 'test-bucket', googleTtsApiKey: 'test-api-key' },
    awsClients: mockAwsClients,
    fetchFn: mockFetch,
  });

  const res = await adapter.synthesize({
    text: 'Xin chào các bạn',
    language: 'vi',
    voiceGender: 'FEMALE',
  });

  assert.equal(res.cached, false);
  assert.deepEqual(res.audioBuffer, apiAudioBytes);
  assert.equal(s3PutCalled, true);
  assert.equal(sentPayload.voice.languageCode, 'vi-VN');
  assert.equal(sentPayload.voice.name, 'vi-VN-Neural2-A');
  assert.equal(sentPayload.input.text, 'Xin chào các bạn');
});

test('GoogleTtsAdapter throws TTS_API_KEY_MISSING when no API key is provided', async () => {
  const adapter = new GoogleTtsAdapter({
    env: { audioBucket: 'test-bucket', googleTtsApiKey: '' },
    awsClients: null,
  });

  await assert.rejects(
    () => adapter.synthesize({ text: 'Hello world', language: 'en' }),
    (err) => {
      assert.equal(err.code, 'TTS_API_KEY_MISSING');
      assert.equal(err.statusCode, 500);
      return true;
    }
  );
});

test('GoogleTtsAdapter throws TTS_SYNTHESIS_FAILED on API error', async () => {
  const mockFetch = async () => ({
    ok: false,
    status: 403,
    text: async () => 'Quota exceeded',
  });

  const adapter = new GoogleTtsAdapter({
    env: { audioBucket: 'test-bucket', googleTtsApiKey: 'key' },
    awsClients: null,
    fetchFn: mockFetch,
  });

  await assert.rejects(
    () => adapter.synthesize({ text: 'Hello', language: 'en' }),
    (err) => {
      assert.equal(err.code, 'TTS_SYNTHESIS_FAILED');
      assert.equal(err.statusCode, 403);
      assert.match(err.message, /Quota exceeded/);
      return true;
    }
  );
});
