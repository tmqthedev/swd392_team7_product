const test = require('node:test');
const assert = require('node:assert/strict');

test('E2E role login credentials are sent as the request body', async () => {
  const { loginRequestOptions } = await import('../../scripts/e2e-auth-options.mjs');

  assert.deepEqual(loginRequestOptions('user@aives.local', 'test-password'), {
    body: {
      email: 'user@aives.local',
      password: 'test-password',
    },
  });
});
