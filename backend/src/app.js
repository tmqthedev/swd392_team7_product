const express = require('express');
const pino = require('pino');
const pinoHttp = require('pino-http');
const env = require('./config/env');
const { createDatabase } = require('./db/createDatabase');
const { createAwsClients } = require('./services/awsClients');
const { AudioWorkflowService } = require('./services/audioWorkflowService');
const { createAudioRouter } = require('./routes/audioRoutes');
const { QuestionRepository } = require('./repositories/questionRepository');
const { QuestionService } = require('./services/questionService');
const { QuestionController } = require('./controllers/questionController');
const { createQuestionRouter } = require('./routes/questionRoutes');
const { RubricRepository } = require('./repositories/rubricRepository');
const { RubricService } = require('./services/rubricService');
const { RubricController } = require('./controllers/rubricController');
const { createRubricRouter } = require('./routes/rubricRoutes');
const { TopicRepository } = require('./repositories/topicRepository');
const { TopicService } = require('./services/topicService');
const { TopicController } = require('./controllers/topicController');
const { createTopicRouter } = require('./routes/topicRoutes');
const { EvaluationRepository } = require('./repositories/evaluationRepository');
const { EvaluationService } = require('./services/evaluationService');
const { EvaluationController } = require('./controllers/evaluationController');
const { createEvaluationRouter } = require('./routes/evaluationRoutes');

function createApp(overrides = {}) {
  const app = express();
  const logger = overrides.logger || pino({ level: process.env.LOG_LEVEL || 'info' });
  const runtimeEnv = overrides.env || env;
  const clients = overrides.clients || createAwsClients(runtimeEnv);
  const audioWorkflowService = new AudioWorkflowService({ clients, env: runtimeEnv });
  const database = overrides.database || createDatabase(runtimeEnv);
  const questionRepository = overrides.questionRepository || new QuestionRepository(database);
  const questionService = overrides.questionService || new QuestionService({ repository: questionRepository });
  const questionController = overrides.questionController || new QuestionController(questionService);
  const rubricRepository = overrides.rubricRepository || new RubricRepository(database);
  const rubricService = overrides.rubricService || new RubricService({ repository: rubricRepository });
  const rubricController = overrides.rubricController || new RubricController(rubricService);
  const topicRepository = overrides.topicRepository || new TopicRepository(database);
  const topicService = overrides.topicService || new TopicService({ repository: topicRepository });
  const topicController = overrides.topicController || new TopicController(topicService);
  const evaluationRepository = overrides.evaluationRepository || new EvaluationRepository(database);
  const evaluationService = overrides.evaluationService || new EvaluationService({ repository: evaluationRepository });
  const evaluationController = overrides.evaluationController || new EvaluationController(evaluationService);

  app.use(express.json());
  app.use(pinoHttp({ logger }));

  app.get('/health', (_req, res) => {
    res.json({
      ok: true,
      mockMode: runtimeEnv.awsMockMode,
      dbMockMode: runtimeEnv.dbMockMode,
    });
  });

  app.use('/api/audio', createAudioRouter(audioWorkflowService));
  app.use('/questions', createQuestionRouter(questionController));
  app.use('/rubrics', createRubricRouter(rubricController));
  app.use('/topics', createTopicRouter(topicController));
  app.use('/evaluations', createEvaluationRouter(evaluationController));

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
