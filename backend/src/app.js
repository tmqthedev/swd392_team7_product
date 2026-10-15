const express = require('express');
const cookieParser = require('cookie-parser');
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
const { LecturerDataController } = require('./controllers/lecturerDataController');
const { createLecturerDataRouter } = require('./routes/lecturerDataRoutes');
const { AppUserRepository } = require('./repositories/appUserRepository');
const { AuthSessionRepository } = require('./repositories/authSessionRepository');
const { PasswordTokenRepository } = require('./repositories/passwordTokenRepository');
const { SubjectRepository } = require('./repositories/subjectRepository');
const { BackgroundJobRepository } = require('./repositories/backgroundJobRepository');
const { TokenService } = require('./auth/tokenService');
const passwordHasher = require('./auth/passwordHasher');
const { AuthService } = require('./services/authService');
const { AuthController } = require('./controllers/authController');
const { createAuthRouter } = require('./routes/authRoutes');
const { createAuthMiddleware } = require('./middleware/auth');
const { verifyOrigin } = require('./middleware/csrf');

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
  const lecturerDataController = overrides.lecturerDataController || new LecturerDataController();

  // --- Auth wiring (repositories -> service -> controller -> router) ---
  const appUserRepository = overrides.appUserRepository || new AppUserRepository(database);
  const authSessionRepository = overrides.authSessionRepository || new AuthSessionRepository(database);
  const passwordTokenRepository = overrides.passwordTokenRepository || new PasswordTokenRepository(database);
  const subjectRepository = overrides.subjectRepository || new SubjectRepository(database);
  const backgroundJobRepository = overrides.backgroundJobRepository || new BackgroundJobRepository(database);
  const tokenService = overrides.tokenService
    || new TokenService({
      // Fall back to a non-production placeholder so createApp works in mock/
      // test environments that leave JWT_SECRET unset. Real deployments always
      // supply JWT_SECRET via env.
      secret: runtimeEnv.jwtSecret || 'aives-dev-insecure-secret',
      accessTtlSec: runtimeEnv.jwtAccessTtlSec || 900,
      refreshTtlSec: runtimeEnv.jwtRefreshTtlSec || 604800,
    });
  const authService = overrides.authService
    || new AuthService({
      appUserRepository,
      authSessionRepository,
      passwordTokenRepository,
      backgroundJobRepository,
      passwordHasher: overrides.passwordHasher || passwordHasher,
      tokenService,
      env: runtimeEnv,
    });
  const authController = overrides.authController
    || new AuthController(authService, { env: runtimeEnv });
  const authMiddleware = overrides.authMiddleware
    || createAuthMiddleware({ tokenService, env: runtimeEnv, appUserRepository });

  app.use(express.json());
  app.use(cookieParser());
  app.use(verifyOrigin([runtimeEnv.appBaseUrl]));
  app.use(pinoHttp({ logger }));

  app.get('/health', (_req, res) => {
    res.json({
      ok: true,
      mockMode: runtimeEnv.awsMockMode,
      dbMockMode: runtimeEnv.dbMockMode,
    });
  });

  app.use('/auth', createAuthRouter(authController, { requireAuth: authMiddleware.requireAuth }));
  app.use('/api/audio', createAudioRouter(audioWorkflowService));
  app.use('/questions', createQuestionRouter(questionController));
  app.use('/rubrics', createRubricRouter(rubricController));
  app.use('/topics', createTopicRouter(topicController));
  app.use('/evaluations', createEvaluationRouter(evaluationController));
  app.use('/api/lecturer', createLecturerDataRouter(lecturerDataController));

  app.use((error, _req, res, _next) => {
    const status = error.statusCode || 500;
    res.status(status).json({
      message: error.message || 'Internal Server Error',
    });
  });

  // Expose auth building blocks so later features can reuse the same
  // middleware/service wiring (e.g. requireAuth/requireRole/requireSubjectScope).
  app.authMiddleware = authMiddleware;
  app.authContext = {
    authService,
    authController,
    authMiddleware,
    tokenService,
    appUserRepository,
    authSessionRepository,
    passwordTokenRepository,
    subjectRepository,
    backgroundJobRepository,
  };

  return app;
}

module.exports = {
  createApp,
};
