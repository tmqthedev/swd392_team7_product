const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(process.cwd(), '.env'), quiet: true });

function readBoolean(key, fallback = false) {
  const raw = process.env[key];
  if (raw === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(raw).toLowerCase());
}

module.exports = {
  port: Number(process.env.PORT || 3000),
  awsRegion: process.env.AWS_REGION || 'ap-southeast-1',
  awsMockMode: readBoolean('AWS_MOCK_MODE', true),
  dbMockMode: readBoolean('DB_MOCK_MODE', true),
  databaseUrl: process.env.DATABASE_URL || '',
  mockDbFile: process.env.MOCK_DB_FILE || '',
  audioBucket: process.env.AUDIO_BUCKET_NAME || 'local-audio-bucket',
  lambdaFunctionName: process.env.AUDIO_LAMBDA_FUNCTION_NAME || 'audio-orchestrator',
  dynamoTableName: process.env.SESSION_TABLE_NAME || 'viva-session-context',
  transcribeOutputBucket: process.env.TRANSCRIBE_OUTPUT_BUCKET || 'local-transcribe-output',
};
