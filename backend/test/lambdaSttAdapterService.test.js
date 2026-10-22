const test = require('node:test');
const assert = require('node:assert/strict');
const { LambdaSttAdapter } = require('../src/stt/lambdaSttAdapter');

test('LambdaSttAdapter returns empty object for empty buffer', async () => {
  const adapter = new LambdaSttAdapter();
  const res = await adapter.transcribe({ audio: Buffer.alloc(0) });
  assert.equal(res.text, '');
  assert.equal(res.confidence, 0);
  assert.deepEqual(res.words, []);
  assert.equal(res.durationMs, 0);
});

test('LambdaSttAdapter invokes Lambda and maps word timings correctly', async () => {
  const mockLambdaClient = {
    send: async (cmd) => {
      assert.equal(cmd.input.FunctionName, 'test-function');
      assert.equal(cmd.input.InvocationType, 'RequestResponse');
      const payload = JSON.parse(cmd.input.Payload.toString('utf8'));
      assert.equal(payload.language, 'vi');
      assert.equal(payload.content_type, 'audio/webm');
      assert.ok(payload.audio_base64);

      return {
        StatusCode: 200,
        Payload: Buffer.from(
          JSON.stringify({
            text: 'xin chào thế giới',
            confidence: 0.96,
            duration: 2.5,
            words: [
              { word: 'xin', start: 0.1, end: 0.4, confidence: 0.98 },
              { word: 'chào', start: 0.5, end: 0.9, confidence: 0.95 },
              { word: 'thế', start: 1.0, end: 1.3, confidence: 0.97 },
              { word: 'giới', start: 1.4, end: 1.8, confidence: 0.94 },
            ],
          })
        ),
      };
    },
  };

  const adapter = new LambdaSttAdapter({
    env: { lambdaFunctionName: 'test-function' },
    lambdaClient: mockLambdaClient,
  });

  const res = await adapter.transcribe({
    audio: Buffer.from('fake-audio-bytes'),
    contentType: 'audio/webm',
    language: 'vi',
  });

  assert.equal(res.text, 'xin chào thế giới');
  assert.equal(res.confidence, 0.96);
  assert.equal(res.durationMs, 2500);
  assert.equal(res.words.length, 4);
  assert.deepEqual(res.words[0], {
    word: 'xin',
    startMs: 100,
    endMs: 400,
    confidence: 0.98,
  });
  assert.deepEqual(res.words[1], {
    word: 'chào',
    startMs: 500,
    endMs: 900,
    confidence: 0.95,
  });
});

test('LambdaSttAdapter throws when Lambda returns FunctionError', async () => {
  const mockLambdaClient = {
    send: async () => ({
      StatusCode: 200,
      FunctionError: 'Unhandled',
      Payload: Buffer.from(JSON.stringify({ errorMessage: 'Memory limit exceeded' })),
    }),
  };

  const adapter = new LambdaSttAdapter({
    env: { lambdaFunctionName: 'test-function' },
    lambdaClient: mockLambdaClient,
  });

  await assert.rejects(
    () => adapter.transcribe({ audio: Buffer.from('audio') }),
    (err) => {
      assert.equal(err.code, 'STT_FUNCTION_ERROR');
      assert.match(err.message, /Memory limit exceeded/);
      return true;
    }
  );
});

test('LambdaSttAdapter warmUp sends warmup ping', async () => {
  let pingSent = false;
  const mockLambdaClient = {
    send: async (cmd) => {
      const payload = JSON.parse(cmd.input.Payload.toString('utf8'));
      assert.equal(payload.action, 'warmup');
      assert.equal(payload.language, 'en');
      pingSent = true;
      return { StatusCode: 200, Payload: Buffer.from('{"status":"warm"}') };
    },
  };

  const adapter = new LambdaSttAdapter({
    env: { lambdaFunctionName: 'test-function' },
    lambdaClient: mockLambdaClient,
  });

  const res = await adapter.warmUp('EN');
  assert.equal(res.ok, true);
  assert.equal(res.language, 'en');
  assert.equal(pingSent, true);
});

test('LambdaSttAdapter warmUp reports a function error without throwing', async () => {
  const adapter = new LambdaSttAdapter({
    lambdaClient: { send: async () => ({ FunctionError: 'Unhandled', Payload: Buffer.from('{"errorMessage":"timeout"}') }) },
  });
  const res = await adapter.warmUp();
  assert.equal(res.ok, false);
  assert.equal(res.language, 'vi');
  assert.match(res.error, /timeout/);
});
