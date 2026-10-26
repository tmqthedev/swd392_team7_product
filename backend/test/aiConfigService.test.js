const test = require('node:test');
const assert = require('node:assert/strict');
const { validateAiConfig } = require('../src/config/validateAiConfig');
const { spawnSync } = require('node:child_process');
const real = { awsMockMode: false, sttProvider: 'lambda', ttsProvider: 'kokoro',
  llmProvider: 'bedrock', embeddingProvider: 'bedrock', bedrockModelId: 'nova',
  bedrockEmbedModelId: 'titan', lambdaFunctionName: 'stt', ttsLambdaFunctionName: 'tts' };
test('runtime permits configured real AI and rejects each mock/unknown provider', () => {
  assert.doesNotThrow(() => validateAiConfig(real));
  for (const key of ['sttProvider', 'ttsProvider', 'llmProvider', 'embeddingProvider']) {
    for (const value of ['mock', 'typo', '']) {
      assert.throws(() => validateAiConfig({ ...real, [key]: value }), { code: 'AI_CONFIG_INVALID' });
    }
  }
  assert.throws(() => validateAiConfig({ ...real, awsMockMode: true }), /AWS_MOCK_MODE/);
});
test('runtime fails before boot on missing model or Lambda configuration without leaking secrets', () => {
  for (const key of ['bedrockModelId', 'bedrockEmbedModelId', 'lambdaFunctionName', 'ttsLambdaFunctionName']) {
    assert.throws(() => validateAiConfig({ ...real, [key]: '', jwtSecret: 'do-not-log-this' }), error => {
      assert.equal(error.message.includes('do-not-log-this'), false);
      return error.code === 'AI_CONFIG_INVALID';
    });
  }
});
test('application entrypoint rejects mock AI before opening a database or listener', () => {
  const result = spawnSync(process.execPath, ['src/server.js'], { encoding: 'utf8',
    env: { ...process.env, AWS_MOCK_MODE: 'true', DB_MOCK_MODE: 'false', DATABASE_URL: 'invalid', JWT_SECRET: 'test-only' } });
  assert.equal(result.status, 1);
  assert.match(result.stdout + result.stderr, /AI_CONFIG_INVALID/);
  assert.equal((result.stdout + result.stderr).includes('Backend API listening'), false);
});
