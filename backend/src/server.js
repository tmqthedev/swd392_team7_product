const { createLogger } = require('./config/logger');
const { createApp } = require('./app');
const env = require('./config/env');
const { createDatabase } = require('./db/createDatabase');
const { runMigrations } = require('./db/migrationRunner');
const { JobQueue } = require('./jobs/jobQueue');
const { registerDefaultHandlers } = require('./jobs/handlers');
const { createEmailService } = require('./services/emailService');

const logger = createLogger();

// DynamoDB Local can come up a moment after the backend: retry up to 5 times
// with a 1 s backoff, then rethrow.
async function ensureSessionTable(contextStore, { attempts = 5, backoffMs = 1000 } = {}) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await contextStore.ensureTable();
      return;
    } catch (err) {
      lastError = err;
      logger.warn({ err, attempt }, 'session table ensure failed; retrying');
      if (attempt < attempts) {
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => { setTimeout(resolve, backoffMs); });
      }
    }
  }
  throw lastError;
}

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

  // Create the DynamoDB session-context table when it is missing. Capability
  // flag set by env (local: true; prod: false, Terraform owns the table), not an
  // environment-name branch. A no-op on the in-memory store. Fails fast after
  // a few attempts so a misconfigured endpoint does not boot half-working.
  if (env.sessionTableAutoCreate) {
    const contextStore = app.interviewContext && app.interviewContext.sessionContextStore;
    if (contextStore) {
      await ensureSessionTable(contextStore);
    }
  }

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

  if (typeof app.attachRealtime === 'function') {
    app.attachRealtime(server);
  }

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
