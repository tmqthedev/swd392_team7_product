const { v4: uuidv4 } = require('uuid');
const {
  TranscribeClient,
  StartTranscriptionJobCommand,
} = require('@aws-sdk/client-transcribe');
const { PollyClient, SynthesizeSpeechCommand } = require('@aws-sdk/client-polly');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  UpdateCommand,
} = require('@aws-sdk/lib-dynamodb');
const { createBedrockAgentCoreProvider } = require('./providers/bedrockAgentCoreProvider');

const region = process.env.AWS_REGION || 'ap-southeast-1';
const sessionTableName = process.env.SESSION_TABLE_NAME || 'viva-session-context';
const speechEnabled = ['1', 'true', 'yes'].includes((process.env.ENABLE_POLLY || 'false').toLowerCase());
const mockMode = ['1', 'true', 'yes'].includes((process.env.AWS_MOCK_MODE || 'false').toLowerCase());

const transcribeClient = new TranscribeClient({ region });
const pollyClient = new PollyClient({ region });
const ddbClient = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));

async function updateSession(sessionId, patch) {
  const entries = Object.entries(patch);
  const expressionNames = { '#updatedAt': 'updatedAt' };
  const expressionValues = { ':updatedAt': new Date().toISOString() };
  const setClauses = [];

  entries.forEach(([key, value], index) => {
    const name = `#f${index}`;
    const valueKey = `:v${index}`;
    expressionNames[name] = key;
    expressionValues[valueKey] = value;
    setClauses.push(`${name} = ${valueKey}`);
  });

  setClauses.push('#updatedAt = :updatedAt');

  await ddbClient.send(
    new UpdateCommand({
      TableName: sessionTableName,
      Key: { sessionId },
      UpdateExpression: `SET ${setClauses.join(', ')}`,
      ExpressionAttributeNames: expressionNames,
      ExpressionAttributeValues: expressionValues,
    }),
  );
}

async function audioUploadedHandler(event) {
  const sessionId = event.sessionId || uuidv4();

  await updateSession(sessionId, {
    status: 'TRANSCRIBING',
    objectKey: event.objectKey,
  });

  if (mockMode) {
    return {
      statusCode: 200,
      body: JSON.stringify({ sessionId, mode: 'mock', message: 'Transcribe job mocked' }),
    };
  }

  const transcriptionJobName = `viva-${sessionId}`;

  await transcribeClient.send(
    new StartTranscriptionJobCommand({
      TranscriptionJobName: transcriptionJobName,
      LanguageCode: 'en-US',
      MediaFormat: event.objectKey.split('.').pop() || 'webm',
      Media: {
        MediaFileUri: `s3://${event.bucket}/${event.objectKey}`,
      },
      OutputBucketName: event.transcribeOutputBucket,
    }),
  );

  await updateSession(sessionId, {
    status: 'TRANSCRIBE_STARTED',
    transcriptionJobName,
  });

  return {
    statusCode: 202,
    body: JSON.stringify({ sessionId, transcriptionJobName }),
  };
}

async function transcribeCompletedHandler(event) {
  const provider = createBedrockAgentCoreProvider();
  const evaluation = await provider.evaluateVivaAnswer({
    sessionId: event.sessionId,
    transcript: event.transcript,
    languageCode: event.languageCode || 'en-US',
  });

  let speech = null;
  if (speechEnabled && !mockMode) {
    const synthesized = await pollyClient.send(
      new SynthesizeSpeechCommand({
        Engine: 'neural',
        OutputFormat: 'mp3',
        Text: evaluation.feedback,
        VoiceId: 'Joanna',
      }),
    );

    speech = {
      contentType: synthesized.ContentType,
      requestCharacters: synthesized.RequestCharacters,
    };
  }

  await updateSession(event.sessionId, {
    status: 'COMPLETED',
    transcript: event.transcript,
    aiEvaluation: evaluation,
    speech,
  });

  return {
    statusCode: 200,
    body: JSON.stringify({ sessionId: event.sessionId, status: 'COMPLETED' }),
  };
}

module.exports = {
  audioUploadedHandler,
  transcribeCompletedHandler,
};
