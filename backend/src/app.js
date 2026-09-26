const express = require('express');
const pino = require('pino');
const pinoHttp = require('pino-http');
const env = require('./config/env');
const { createAwsClients } = require('./services/awsClients');
const { AudioWorkflowService } = require('./services/audioWorkflowService');
const { createAudioRouter } = require('./routes/audioRoutes');

function createApp(overrides = {}) {
  const app = express();
  const logger = overrides.logger || pino({ level: process.env.LOG_LEVEL || 'info' });
  const runtimeEnv = overrides.env || env;
  const clients = overrides.clients || createAwsClients(runtimeEnv);
  const audioWorkflowService = new AudioWorkflowService({ clients, env: runtimeEnv });

  app.use(express.json());
  app.use(pinoHttp({ logger }));

  app.get('/health', (_req, res) => {
    res.json({ ok: true, mockMode: runtimeEnv.awsMockMode });
  });

  app.use('/api/audio', createAudioRouter(audioWorkflowService));

  app.use((error, _req, res, _next) => {
    const status = error.statusCode || 500;
    res.status(status).json({
      message: error.message || 'Internal Server Error',
    });
  });

  return app;
}

module.exports = {
  createApp,
};
