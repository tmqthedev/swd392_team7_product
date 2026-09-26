const test = require('node:test');
const assert = require('node:assert/strict');
const { AudioWorkflowService } = require('../src/services/audioWorkflowService');

function createMockClients() {
  const sessions = new Map();
  return {
    mockMode: true,
    sessionStore: {
      async put(item) {
        sessions.set(item.sessionId, item);
      },
      async get(sessionId) {
        return sessions.get(sessionId) || null;
      },
      async update(sessionId, patch) {
        const current = sessions.get(sessionId) || { sessionId };
        const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
        sessions.set(sessionId, next);
        return next;
      },
    },
    async getUploadUrl({ bucket, key }) {
      return `https://example.test/${bucket}/${key}`;
    },
    async invokeAudioWorkflow() {
      return { accepted: true };
    },
  };
}

test('creates upload session and returns signed URL payload', async () => {
  const service = new AudioWorkflowService({
    clients: createMockClients(),
    env: { audioBucket: 'audio-bucket', transcribeOutputBucket: 'transcribe-output' },
  });

  const result = await service.createUploadSession({ contentType: 'audio/wav', candidateId: 'cand-1' });

  assert.equal(typeof result.sessionId, 'string');
  assert.equal(result.objectKey.endsWith('.wav'), true);
  assert.equal(result.uploadUrl.includes('/audio-bucket/'), true);
});

test('mock processing completes with transcript and ai evaluation', async () => {
  const clients = createMockClients();
  const service = new AudioWorkflowService({
    clients,
    env: { audioBucket: 'audio-bucket', transcribeOutputBucket: 'transcribe-output' },
  });

  const created = await service.createUploadSession({});
  const processing = await service.startProcessing({ sessionId: created.sessionId });
  const status = await service.getSessionStatus(created.sessionId);
  const result = await service.getSessionResult(created.sessionId);

  assert.equal(processing.status, 'PROCESSING');
  assert.equal(status.status, 'COMPLETED');
  assert.equal(result.transcript, 'Mock transcript content.');
  assert.equal(result.aiEvaluation.score > 0, true);
});
