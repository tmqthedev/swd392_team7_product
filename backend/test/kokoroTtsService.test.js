const test = require('node:test');
const assert = require('node:assert/strict');
const { KokoroTtsAdapter } = require('../src/tts/kokoroTtsAdapter');
const { createTtsAdapter } = require('../src/tts/ttsAdapter');

const KEY_RE = /^tts-cache\/[0-9a-f]{64}\.wav$/;

function noSuchKey() {
  const err = new Error('NoSuchKey');
  err.code = 'NoSuchKey';
  throw err;
}

test('KokoroTtsAdapter returns empty buffer for empty text without invoking Lambda', async () => {
  const adapter = new KokoroTtsAdapter({
    lambdaClient: { send: async () => assert.fail('Lambda should not be invoked') },
  });
  const res = await adapter.synthesize({ text: '   ' });
  assert.equal(res.audioBuffer.length, 0);
  assert.equal(res.cached, true);
});

test('KokoroTtsAdapter returns cached audio from S3 without invoking Lambda', async () => {
  const cachedBuffer = Buffer.from('cached-wav-bytes');
  const adapter = new KokoroTtsAdapter({
    env: { audioBucket: 'test-bucket' },
    awsClients: {
      getObject: async ({ bucket, key }) => {
        assert.equal(bucket, 'test-bucket');
        assert.match(key, KEY_RE);
        return cachedBuffer;
      },
      putObject: async () => assert.fail('putObject should not be called on cache hit'),
    },
    lambdaClient: { send: async () => assert.fail('Lambda should not be invoked on cache hit') },
  });

  const res = await adapter.synthesize({ text: 'Xin chào', language: 'vi' });
  assert.equal(res.cached, true);
  assert.deepEqual(res.audioBuffer, cachedBuffer);
  assert.match(res.audioKey, KEY_RE);
});

test('KokoroTtsAdapter invokes Lambda on cache miss and stores the audio in S3', async () => {
  const wavBytes = Buffer.from('RIFF-new-wav');
  let sent = null;
  let stored = null;

  const adapter = new KokoroTtsAdapter({
    env: { audioBucket: 'test-bucket', ttsLambdaFunctionName: 'test-tts' },
    awsClients: {
      getObject: async () => noSuchKey(),
      putObject: async (args) => {
        stored = args;
      },
    },
    lambdaClient: {
      send: async (cmd) => {
        sent = { name: cmd.input.FunctionName, type: cmd.input.InvocationType, payload: JSON.parse(cmd.input.Payload.toString('utf8')) };
        return {
          StatusCode: 200,
          Payload: Buffer.from(JSON.stringify({
            audio_base64: wavBytes.toString('base64'),
            content_type: 'audio/wav',
            duration: 1.2,
          })),
        };
      },
    },
  });

  const res = await adapter.synthesize({ text: '  What is a mutex?  ', language: 'EN' });
  assert.deepEqual(sent, {
    name: 'test-tts',
    type: 'RequestResponse',
    payload: { text: 'What is a mutex?', language: 'en', voice: 'af_heart' },
  });
  assert.equal(stored.bucket, 'test-bucket');
  assert.equal(stored.key, res.audioKey);
  assert.equal(stored.contentType, 'audio/wav');
  assert.deepEqual(stored.body, wavBytes);
  assert.equal(res.cached, false);
  assert.deepEqual(res.audioBuffer, wavBytes);
  assert.match(res.audioKey, KEY_RE);
});

test('KokoroTtsAdapter defaults to the female Vietnamese voice', async () => {
  let payload = null;
  const adapter = new KokoroTtsAdapter({
    lambdaClient: {
      send: async (cmd) => {
        payload = JSON.parse(cmd.input.Payload.toString('utf8'));
        return { Payload: Buffer.from(JSON.stringify({ audio_base64: 'AAAA' })) };
      },
    },
  });
  await adapter.synthesize({ text: 'Xin chào' });
  assert.equal(payload.language, 'vi');
  assert.equal(payload.voice, 'diem_trinh');
});

test('KokoroTtsAdapter throws when the Lambda function errors and caches nothing', async () => {
  const adapter = new KokoroTtsAdapter({
    awsClients: {
      getObject: async () => noSuchKey(),
      putObject: async () => assert.fail('putObject should not be called on failure'),
    },
    lambdaClient: {
      send: async () => ({
        StatusCode: 200,
        FunctionError: 'Unhandled',
        Payload: Buffer.from(JSON.stringify({ errorMessage: 'model missing' })),
      }),
    },
  });

  await assert.rejects(
    () => adapter.synthesize({ text: 'Xin chào', language: 'vi' }),
    (err) => err.code === 'TTS_SYNTHESIS_FAILED' && /model missing/.test(err.message),
  );
});

test('KokoroTtsAdapter throws when the Lambda returns no audio', async () => {
  const adapter = new KokoroTtsAdapter({
    lambdaClient: { send: async () => ({ StatusCode: 200, Payload: Buffer.from('{}') }) },
  });
  await assert.rejects(
    () => adapter.synthesize({ text: 'Xin chào' }),
    (err) => err.code === 'TTS_EMPTY_RESPONSE',
  );
});

test('createTtsAdapter kokoro provider off mock returns KokoroTtsAdapter', () => {
  assert.ok(createTtsAdapter({ awsMockMode: false, ttsProvider: 'kokoro' }) instanceof KokoroTtsAdapter);
  assert.ok(!(createTtsAdapter({ awsMockMode: true, ttsProvider: 'kokoro' }) instanceof KokoroTtsAdapter));
});

test('KokoroTtsAdapter warmUp pings the Lambda with the language and never throws', async () => {
  const payloads = [];
  const ok = new KokoroTtsAdapter({
    lambdaClient: {
      send: async (cmd) => {
        payloads.push(JSON.parse(cmd.input.Payload.toString('utf8')));
        return { StatusCode: 200, Payload: Buffer.from('{"status":"warm"}') };
      },
    },
  });
  const res = await ok.warmUp('EN');
  assert.equal(res.ok, true);
  assert.deepEqual(payloads, [{ action: 'warmup', language: 'en' }]);

  const failing = new KokoroTtsAdapter({ lambdaClient: { send: async () => { throw new Error('network down'); } } });
  const bad = await failing.warmUp('vi');
  assert.equal(bad.ok, false);
  assert.match(bad.error, /network down/);
});
