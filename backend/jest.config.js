/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  rootDir: __dirname,
  // Only pick up Jest E2E suites. The other files in test/ use `node:test`
  // and are run via `npm test` (node --test).
  // Note: the pattern is intentionally not anchored with `<rootDir>`. When the
  // project lives under a dot-directory (e.g. a git worktree in `.worktrees/`),
  // an absolute, dot-containing path is excluded by micromatch's default
  // dotfile handling, so an anchored glob matches zero files. A leading `**`
  // matches regardless of a dot-segment in the resolved path.
  testMatch: ['**/test/**/*.e2e.test.js'],
  // uuid@13 is ESM-only; map it to a CommonJS stub for Jest.
  moduleNameMapper: {
    '^uuid$': '<rootDir>/test/helpers/uuidStub.js',
  },
  testTimeout: 15000,
  clearMocks: true,
  verbose: true,
};
