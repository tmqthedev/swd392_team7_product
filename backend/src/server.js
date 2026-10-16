const pino = require('pino');
const { createApp } = require('./app');
const env = require('./config/env');
const { createDatabase } = require('./db/createDatabase');
const { runMigrations } = require('./db/migrationRunner');
const { JobQueue } = require('./jobs/jobQueue');
const { registerDefaultHandlers } = require('./jobs/handlers');
const { createEmailService } = require('./services/emailService');

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

async function start() {
  const overrides = { logger };
  let database = null;

  // A real database means real accounts: never sign sessions with the built-in
  // development secret that createApp falls back to for mock/test boots.
  if (!env.dbMockMode && !env.jwtSecret) {
    throw new Error('JWT_SECRET is required when DB_MOCK_MODE is false.');
  }

  if (!env.dbMockMode) {
    database = createDatabase(env);
    if (database.pool) {
      await runMigrations({ pool: database.pool, dir: env.migrationsDir, logger });
    }
    overrides.database = database;
  }

  const app = createApp(overrides);
  let queue = null;

  // Start the background job queue with the real SEND_EMAIL handler backed by
  // the SMTP email service (Mailpit locally). Only runs against a real DB.
  if (database && database.withTransaction) {
    const emailService = createEmailService({ env });
    queue = new JobQueue({ db: database, env, logger });
    registerDefaultHandlers(queue, { logger, emailService, ...app.jobContext });
    queue.start();
  }

  const server = app.listen(env.port, () => {
    process.stdout.write(`Backend API listening on port ${env.port}\n`);
  });

  // Graceful shutdown: stop accepting work, let in-flight jobs settle, then exit
  // so a redeploy does not strand jobs mid-run.
  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'shutting down');
    server.close();
    try {
      if (queue) await queue.stop();
      if (database && database.end) await database.end();
    } catch (err) {
      logger.error({ err }, 'error during shutdown');
    }
    process.exit(0);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start().catch((error) => {
  logger.error({ err: error }, 'Failed to start backend');
  process.exit(1);
});
