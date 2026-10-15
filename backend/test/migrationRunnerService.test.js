const test = require('node:test');
const assert = require('node:assert/strict');
const { orderMigrationFiles, pendingMigrations } = require('../src/db/migrationRunner');

test('orderMigrationFiles sorts by numeric prefix (001 < 002 < 010)', () => {
  const ordered = orderMigrationFiles([
    '010_background_job.sql',
    '002_rubric_criterion.sql',
    '001_baseline.sql',
  ]);
  assert.deepEqual(ordered, [
    '001_baseline.sql',
    '002_rubric_criterion.sql',
    '010_background_job.sql',
  ]);
});

test('orderMigrationFiles ignores files without a numeric prefix', () => {
  const ordered = orderMigrationFiles([
    'README.md',
    '003_extensions.sql',
    'notes.txt',
    '001_baseline.sql',
  ]);
  assert.deepEqual(ordered, ['001_baseline.sql', '003_extensions.sql']);
});

test('pendingMigrations returns only versions not yet applied, in order', () => {
  const all = ['001', '002', '003', '010'];
  const applied = ['001', '003'];
  assert.deepEqual(pendingMigrations(all, applied), ['002', '010']);
});

test('pendingMigrations returns empty when everything is applied', () => {
  const all = ['001', '002'];
  assert.deepEqual(pendingMigrations(all, ['001', '002']), []);
});
