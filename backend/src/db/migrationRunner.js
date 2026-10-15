const fs = require('fs');
const path = require('path');

const MIGRATION_FILE_PATTERN = /^(\d+)_.*\.sql$/i;

/**
 * Extract the leading numeric version from a migration filename.
 * Returns null when the filename does not match NNN_name.sql.
 */
function versionOf(filename) {
  const match = MIGRATION_FILE_PATTERN.exec(filename);
  return match ? match[1] : null;
}

/**
 * Order migration filenames by their numeric prefix ascending (001 < 002 < 010).
 * Files that do not match the NNN_name.sql pattern are dropped.
 */
function orderMigrationFiles(filenames) {
  return filenames
    .filter((name) => MIGRATION_FILE_PATTERN.test(name))
    .slice()
    .sort((a, b) => {
      const av = Number(versionOf(a));
      const bv = Number(versionOf(b));
      if (av !== bv) return av - bv;
      return a.localeCompare(b);
    });
}

/**
 * Given all known versions (ordered) and the versions already applied,
 * return the versions still pending, preserving the input order.
 */
function pendingMigrations(allVersions, appliedVersions) {
  const applied = new Set(appliedVersions);
  return allVersions.filter((version) => !applied.has(version));
}

/**
 * Apply numbered SQL migrations from `dir` against the pool in order.
 * Tracks applied versions in schema_migrations; each pending migration runs
 * in its own transaction. Idempotent on re-run.
 */
async function runMigrations({ pool, dir, logger }) {
  const log = logger || console;

  await pool.query(
    'CREATE TABLE IF NOT EXISTS schema_migrations ('
    + ' version TEXT PRIMARY KEY,'
    + ' applied_at TIMESTAMPTZ DEFAULT now()'
    + ')',
  );

  const files = orderMigrationFiles(fs.readdirSync(dir));
  const fileByVersion = new Map();
  for (const file of files) {
    fileByVersion.set(versionOf(file), file);
  }

  const applied = await pool.query('SELECT version FROM schema_migrations');
  const appliedVersions = applied.rows.map((row) => row.version);
  const allVersions = files.map((file) => versionOf(file));
  const pending = pendingMigrations(allVersions, appliedVersions);

  for (const version of pending) {
    const file = fileByVersion.get(version);
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [version]);
      await client.query('COMMIT');
      if (typeof log.info === 'function') {
        log.info({ version, file }, 'Applied migration');
      }
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  return { applied: pending };
}

module.exports = {
  runMigrations,
  orderMigrationFiles,
  pendingMigrations,
};
