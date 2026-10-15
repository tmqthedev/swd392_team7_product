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

  if (!env.dbMockMode) {
    database = createDatabase(env);
    if (database.pool) {
      await runMigrations({ pool: database.pool, dir: env.migrationsDir, logger });
    }
    overrides.database = database;
  }

  const app = createApp(overrides);

  // Start the background job queue with the real SEND_EMAIL handler backed by
  // the SMTP email service (Mailpit locally). Only runs against a real DB.
  if (database && database.withTransaction) {
    const emailService = createEmailService({ env });
    const queue = new JobQueue({ db: database, env, logger });
    registerDefaultHandlers(queue, { logger, emailService, ...app.jobContext });
    queue.start();
  }

  app.listen(env.port, () => {
    process.stdout.write(`Backend API listening on port ${env.port}\n`);
  });
}

start().catch((error) => {
  logger.error({ err: error }, 'Failed to start backend');
  process.exit(1);
});
