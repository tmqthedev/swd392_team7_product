// Called only by the application entrypoint. Tests construct createApp with DI.
function validateAiConfig(env) {
  const problems = [];
  if (env.awsMockMode) problems.push('AWS_MOCK_MODE must be false');
  for (const [key, allowed] of Object.entries({
    sttProvider: ['lambda'], ttsProvider: ['kokoro', 'google'],
    llmProvider: ['bedrock', 'nova'], embeddingProvider: ['bedrock', 'titan'],
  })) {
    if (!allowed.includes(env[key])) problems.push(`${key} must be ${allowed.join(' or ')}`);
  }
  if (!env.bedrockModelId) problems.push('BEDROCK_MODEL_ID is required');
  if (!env.bedrockEmbedModelId) problems.push('BEDROCK_EMBED_MODEL_ID is required');
  if (!env.lambdaFunctionName) problems.push('AUDIO_LAMBDA_FUNCTION_NAME is required');
  if (env.ttsProvider === 'kokoro' && !env.ttsLambdaFunctionName) {
    problems.push('TTS_LAMBDA_FUNCTION_NAME is required');
  }
  if (problems.length) {
    const error = new Error(`Invalid AI configuration: ${problems.join('; ')}.`);
    error.code = 'AI_CONFIG_INVALID';
    throw error;
  }
}
module.exports = { validateAiConfig };
