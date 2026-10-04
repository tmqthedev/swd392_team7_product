/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  rootDir: __dirname,
  // Only pick up Jest E2E suites. The other files in test/ use `node:test`
  // and are run via `npm test` (node --test).
  testMatch: ['<rootDir>/test/**/*.e2e.test.js'],
  // uuid@13 is ESM-only; map it to a CommonJS stub for Jest.
  moduleNameMapper: {
    '^uuid$': '<rootDir>/test/helpers/uuidStub.js',
  },
  testTimeout: 15000,
  clearMocks: true,
  verbose: true,
};
