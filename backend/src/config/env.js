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
  dynamodbEndpoint: process.env.DYNAMODB_ENDPOINT || '',
  s3Endpoint: process.env.S3_ENDPOINT || '',
  lambdaEndpoint: process.env.LAMBDA_ENDPOINT || '',
  smtpHost: process.env.SMTP_HOST || '',
  smtpPort: Number(process.env.SMTP_PORT || 1025),
  smtpUser: process.env.SMTP_USER || '',
  smtpPass: process.env.SMTP_PASS || '',
  smtpFrom: process.env.SMTP_FROM || 'no-reply@aives.local',
  smtpSecure: readBoolean('SMTP_SECURE', false),
  appBaseUrl: process.env.APP_BASE_URL || 'http://localhost:8080',
  bedrockModelId: process.env.BEDROCK_MODEL_ID || '',
  bedrockEmbedModelId: process.env.BEDROCK_EMBED_MODEL_ID || '',
  embeddingProvider: process.env.EMBEDDING_PROVIDER || 'mock',
  llmProvider: process.env.LLM_PROVIDER || 'mock',
  ttsProvider: process.env.TTS_PROVIDER || 'mock',
  jwtSecret: process.env.JWT_SECRET || '',
  jwtAccessTtlSec: Number(process.env.JWT_ACCESS_TTL_SEC || 900),
  jwtRefreshTtlSec: Number(process.env.JWT_REFRESH_TTL_SEC || 604800),
  cookieSecure: readBoolean('COOKIE_SECURE', false),
  cookieSameSite: process.env.COOKIE_SAME_SITE || 'Lax',
  passwordSetTtlHours: Number(process.env.PASSWORD_SET_TTL_HOURS || 72),
  passwordResetTtlMinutes: Number(process.env.PASSWORD_RESET_TTL_MINUTES || 30),
  loginMaxFailures: Number(process.env.LOGIN_MAX_FAILURES || 5),
  loginWindowMinutes: Number(process.env.LOGIN_WINDOW_MINUTES || 15),
  loginLockMinutes: Number(process.env.LOGIN_LOCK_MINUTES || 15),
  materialsBucket: process.env.MATERIALS_BUCKET_NAME || 'local-materials-bucket',
  jobQueueConcurrency: Number(process.env.JOB_QUEUE_CONCURRENCY || 2),
  jobQueuePollIntervalMs: Number(process.env.JOB_QUEUE_POLL_INTERVAL_MS || 1000),
  jobMaxAttempts: Number(process.env.JOB_MAX_ATTEMPTS || 3),
  migrationsDir: process.env.MIGRATIONS_DIR || path.resolve(__dirname, '..', '..', 'db', 'migrations'),
};
