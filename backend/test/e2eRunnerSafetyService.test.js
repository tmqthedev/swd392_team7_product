const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { createRequire } = require('node:module');

const repoRoot = path.resolve(__dirname, '../..');
const businessFlowScript = path.join(repoRoot, 'scripts', 'e2e-business-flows.mjs');
const ssmScript = path.join(repoRoot, 'scripts', 'aws-ssm.js');
const cleanupScript = path.join(repoRoot, 'scripts', 'cleanup-test-data.mjs');
const restrictScript = path.join(repoRoot, 'scripts', 'e2e-restrict.mjs');
const samplePdfModule = path.join(repoRoot, 'scripts', 'e2e-sample-pdf.mjs');
const requireBackend = createRequire(path.join(repoRoot, 'backend', 'package.json'));

const minimalEnv = {
  PATH: process.env.PATH,
  SystemRoot: process.env.SystemRoot,
  TEMP: process.env.TEMP,
  TMP: process.env.TMP,
};

function runNode(script, env, args = []) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: repoRoot,
    env: { ...minimalEnv, ...env },
    encoding: 'utf8',
  });
}

const validProductionEnv = {
  BASE_URL: 'https://d36ezmiqpl9miu.cloudfront.net',
  E2E_ADMIN_IDENTIFIER: 'test-admin@example.com',
  E2E_ADMIN_PASSWORD: 'dummy-admin-password',
  E2E_USER_PASSWORD: 'dummy-user-password',
  E2E_TEST_EMAIL_BASE: 'tester@gmail.com',
};

test('production E2E runner requires explicit target, credentials, and test email alias inbox', () => {
  const result = runNode(businessFlowScript, {});
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /BASE_URL is required/);
});

test('production E2E runner refuses the production URL without explicit approval', () => {
  const result = runNode(businessFlowScript, validProductionEnv);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Production target detected/);
});

test('production E2E runner accepts the explicitly approved production URL without making requests', () => {
  const result = runNode(businessFlowScript, {
    ...validProductionEnv,
    E2E_ALLOW_PRODUCTION: 'YES',
  });
  assert.equal(result.status, 0, result.stderr);
});

test('restrict runner refuses the production URL without explicit approval', () => {
  const result = runNode(restrictScript, {
    BASE_URL: 'https://d36ezmiqpl9miu.cloudfront.net',
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Production target detected/);
});

test('SSM helper refuses an implicit EC2 target before invoking AWS', () => {
  const result = runNode(ssmScript, { E2E_ALLOW_PRODUCTION: 'YES' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /E2E_SSM_INSTANCE_ID is required/);
});

test('SSM helper requires explicit production approval before invoking AWS', () => {
  const result = runNode(ssmScript, { E2E_SSM_INSTANCE_ID: 'i-0123456789abcdef0' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /requires E2E_ALLOW_PRODUCTION=YES/);
});

test('cleanup requires a separate explicit confirmation before committing', () => {
  const result = runNode(cleanupScript, {
    ...validProductionEnv,
    E2E_ALLOW_PRODUCTION: 'YES',
  }, ['--apply']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /E2E_CONFIRM_CLEANUP=YES/);
});

test('E2E material fixture is a parseable PDF containing the expected course text', async () => {
  const { makeSamplePdf } = await import(pathToFileURL(samplePdfModule).href);
  const pdfjsPath = requireBackend.resolve('pdfjs-dist/legacy/build/pdf.mjs');
  const pdfjs = await import(pathToFileURL(pdfjsPath).href);
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(makeSamplePdf()) }).promise;
  assert.equal(pdf.numPages, 1);
  const page = await pdf.getPage(1);
  const text = (await page.getTextContent()).items.map((item) => item.str).join(' ');
  assert.match(text, /Clean Architecture and Microservices Principles/);
});
