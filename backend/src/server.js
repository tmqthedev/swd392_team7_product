const pino = require('pino');
const { createApp } = require('./app');
const env = require('./config/env');
const { createDatabase } = require('./db/createDatabase');
const { runMigrations } = require('./db/migrationRunner');

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

async function start() {
  const overrides = { logger };

  if (!env.dbMockMode) {
    const database = createDatabase(env);
    if (database.pool) {
      await runMigrations({ pool: database.pool, dir: env.migrationsDir, logger });
    }
    overrides.database = database;
  }

  const app = createApp(overrides);

  app.listen(env.port, () => {
    process.stdout.write(`Backend API listening on port ${env.port}\n`);
  });
}

start().catch((error) => {
  logger.error({ err: error }, 'Failed to start backend');
  process.exit(1);
});
