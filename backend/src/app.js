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
const { createEmbeddingAdapter } = require('./embedding/embeddingAdapter');
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
const { resolveJwtSecret } = require('./auth/resolveJwtSecret');
const passwordHasher = require('./auth/passwordHasher');
const { AuthService } = require('./services/authService');
const { AuthController } = require('./controllers/authController');
const { createAuthRouter } = require('./routes/authRoutes');
const { createAuthMiddleware } = require('./middleware/auth');
const { verifyOrigin } = require('./middleware/csrf');
const { AdminService } = require('./services/adminService');
const { AdminController } = require('./controllers/adminController');
const { createAdminRouter } = require('./routes/adminRoutes');
const { CourseMaterialRepository } = require('./repositories/courseMaterialRepository');
const { MaterialChunkRepository } = require('./repositories/materialChunkRepository');
const { MaterialService } = require('./services/materialService');
const { MaterialController } = require('./controllers/materialController');
const { createMaterialRouter } = require('./routes/materialRoutes');
const { parse } = require('./ingest/parseDocument');
const { createLlmAdapter } = require('./llm/llmAdapter');
const { QuestionGenerationJobRepository } = require('./repositories/questionGenerationJobRepository');
const { QuestionSourceRefRepository } = require('./repositories/questionSourceRefRepository');
const { QuestionGenerationService } = require('./services/questionGenerationService');
const { QuestionGenerationController } = require('./controllers/questionGenerationController');
const { createQuestionGenerationRouter } = require('./routes/questionGenerationRoutes');

function createApp(overrides = {}) {
  const app = express();
  const logger = overrides.logger || pino({ level: process.env.LOG_LEVEL || 'info' });
  const runtimeEnv = overrides.env || env;
  const clients = overrides.clients || createAwsClients(runtimeEnv);
  const audioWorkflowService = new AudioWorkflowService({ clients, env: runtimeEnv });
  const database = overrides.database || createDatabase(runtimeEnv);
  const embeddingAdapter = overrides.embeddingAdapter || createEmbeddingAdapter(runtimeEnv);
  const rubricRepository = overrides.rubricRepository || new RubricRepository(database);
  const topicRepository = overrides.topicRepository || new TopicRepository(database);
  const questionRepository = overrides.questionRepository || new QuestionRepository(database);
  const questionSourceRefRepository = overrides.questionSourceRefRepository
    || new QuestionSourceRefRepository(database);
  // Constructed up front so the question/rubric services can enforce lecturer->
  // subject scope (the auth wiring below reuses this same instance).
  const subjectRepository = overrides.subjectRepository || new SubjectRepository(database);
  const questionService = overrides.questionService || new QuestionService({
    repository: questionRepository,
    embeddingAdapter,
    rubricRepository,
    topicRepository,
    subjectRepository,
    db: database,
    questionSourceRefRepository,
  });
  const questionController = overrides.questionController || new QuestionController(questionService);
  const rubricService = overrides.rubricService || new RubricService({
    repository: rubricRepository,
    subjectRepository,
  });
  const rubricController = overrides.rubricController || new RubricController(rubricService);
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
  const backgroundJobRepository = overrides.backgroundJobRepository || new BackgroundJobRepository(database);
  const tokenService = overrides.tokenService
    || new TokenService({
      // resolveJwtSecret hard-fails a missing JWT_SECRET in a non-mock
      // (production) environment and only yields the dev placeholder in mock/
      // test. Real deployments always supply JWT_SECRET via env.
      secret: resolveJwtSecret(runtimeEnv),
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

  // --- Admin wiring (service -> controller -> router) ---
  const adminService = overrides.adminService
    || new AdminService({
      appUserRepository,
      subjectRepository,
      passwordTokenRepository,
      backgroundJobRepository,
      env: runtimeEnv,
    });
  const adminController = overrides.adminController || new AdminController(adminService);

  // --- Materials / ingestion wiring (Step 4 FEAT-001) ---
  const courseMaterialRepository = overrides.courseMaterialRepository
    || new CourseMaterialRepository(database);
  const materialChunkRepository = overrides.materialChunkRepository
    || new MaterialChunkRepository(database);
  // Enqueue port: request-time services push jobs via backgroundJobRepository,
  // not a JobQueue handle (which only exists in server.js).
  const enqueueJob = overrides.enqueueJob
    || ((type, payload) => backgroundJobRepository.enqueue(type, payload));
  const materialService = overrides.materialService
    || new MaterialService({
      courseMaterialRepository,
      subjectRepository,
      topicRepository,
      awsClients: clients,
      enqueueJob,
      env: runtimeEnv,
      logger,
    });
  const materialController = overrides.materialController
    || new MaterialController(materialService);

  // --- Question generation wiring (Step 4 FEAT-002) ---
  const llmAdapter = overrides.llmAdapter || createLlmAdapter(runtimeEnv);
  const questionGenerationJobRepository = overrides.questionGenerationJobRepository
    || new QuestionGenerationJobRepository(database);
  const questionGenerationService = overrides.questionGenerationService
    || new QuestionGenerationService({
      questionGenerationJobRepository,
      questionRepository,
      questionSourceRefRepository,
      courseMaterialRepository,
      topicRepository,
      subjectRepository,
      embeddingAdapter,
      enqueueJob,
      logger,
    });
  const questionGenerationController = overrides.questionGenerationController
    || new QuestionGenerationController(questionGenerationService, {
      jobRepository: questionGenerationJobRepository,
    });

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
  app.use('/admin', createAdminRouter(adminController, {
    requireAuth: authMiddleware.requireAuth,
    requireRole: authMiddleware.requireRole,
  }));
  app.use('/api/audio', createAudioRouter(audioWorkflowService));
  app.use('/questions', createQuestionRouter(questionController, {
    requireAuth: authMiddleware.requireAuth,
    requireRole: authMiddleware.requireRole,
  }));
  app.use('/rubrics', createRubricRouter(rubricController, {
    requireAuth: authMiddleware.requireAuth,
    requireRole: authMiddleware.requireRole,
  }));
  app.use('/materials', createMaterialRouter(materialController, {
    requireAuth: authMiddleware.requireAuth,
    requireRole: authMiddleware.requireRole,
  }));
  app.use('/question-generation-jobs', createQuestionGenerationRouter(questionGenerationController, {
    requireAuth: authMiddleware.requireAuth,
    requireRole: authMiddleware.requireRole,
  }));
  app.use('/topics', authMiddleware.requireAuth, createTopicRouter(topicController));
  app.use('/evaluations', authMiddleware.requireAuth, createEvaluationRouter(evaluationController));
  app.use('/api/lecturer', authMiddleware.requireAuth, createLecturerDataRouter(lecturerDataController));

  app.use((error, _req, res, _next) => {
    const status = error.statusCode || 500;
    const body = {
      message: error.message || 'Internal Server Error',
    };
    // Surface the structured error code so the frontend can branch on it
    // (e.g. EMAIL_TAKEN / CODE_TAKEN / VALIDATION_ERROR). Without this the
    // client only ever sees the generic fallback message.
    if (error.code) {
      body.code = error.code;
    }
    res.status(status).json(body);
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
    adminService,
    adminController,
  };

  // Dependencies the background job handlers need. server.js spreads these into
  // registerDefaultHandlers in its DB branch so the real INGEST_MATERIAL
  // handler is built only when a transactional DB is present.
  app.jobContext = {
    db: database,
    courseMaterialRepository,
    materialChunkRepository,
    embeddingAdapter,
    llmAdapter,
    awsClients: clients,
    parse,
    env: runtimeEnv,
    questionRepository,
    questionSourceRefRepository,
    questionGenerationJobRepository,
    topicRepository,
  };

  return app;
}

module.exports = {
  createApp,
};
