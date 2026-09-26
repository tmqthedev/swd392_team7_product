const { v4: uuidv4 } = require('uuid');

class AudioWorkflowService {
  constructor({ clients, env }) {
    this.clients = clients;
    this.env = env;
  }

  async createUploadSession({ contentType = 'audio/webm', candidateId = 'anonymous' }) {
    const sessionId = uuidv4();
    const objectKey = `sessions/${sessionId}/input.${this._extFromContentType(contentType)}`;
    const uploadUrl = await this.clients.getUploadUrl({ bucket: this.env.audioBucket, key: objectKey });

    const session = {
      sessionId,
      candidateId,
      objectKey,
      status: 'UPLOADED',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await this.clients.sessionStore.put(session);

    return {
      sessionId,
      objectKey,
      uploadUrl,
      expiresInSeconds: 300,
    };
  }

  async startProcessing({ sessionId }) {
    const session = await this.clients.sessionStore.get(sessionId);
    if (!session) {
      const err = new Error('Session not found');
      err.statusCode = 404;
      throw err;
    }

    await this.clients.sessionStore.update(sessionId, { status: 'PROCESSING' });

    await this.clients.invokeAudioWorkflow({
      version: '2026-09-26',
      type: 'AudioUploaded',
      sessionId,
      bucket: this.env.audioBucket,
      objectKey: session.objectKey,
      transcribeOutputBucket: this.env.transcribeOutputBucket,
      requestedAt: new Date().toISOString(),
    });

    if (this.clients.mockMode) {
      await this.clients.sessionStore.update(sessionId, {
        status: 'COMPLETED',
        transcript: 'Mock transcript content.',
        aiEvaluation: {
          score: 8.2,
          summary: 'Mock Bedrock evaluation from local adapter.',
        },
        speechUrl: null,
      });
    }

    return { sessionId, status: 'PROCESSING' };
  }

  async getSessionStatus(sessionId) {
    const session = await this.clients.sessionStore.get(sessionId);
    if (!session) {
      const err = new Error('Session not found');
      err.statusCode = 404;
      throw err;
    }

    return {
      sessionId,
      status: session.status,
      updatedAt: session.updatedAt,
    };
  }

  async getSessionResult(sessionId) {
    const session = await this.clients.sessionStore.get(sessionId);
    if (!session) {
      const err = new Error('Session not found');
      err.statusCode = 404;
      throw err;
    }

    return {
      sessionId,
      status: session.status,
      transcript: session.transcript || null,
      aiEvaluation: session.aiEvaluation || null,
      speechUrl: session.speechUrl || null,
    };
  }

  _extFromContentType(contentType) {
    if (contentType.includes('wav')) return 'wav';
    if (contentType.includes('mp3')) return 'mp3';
    return 'webm';
  }
}

module.exports = {
  AudioWorkflowService,
};
