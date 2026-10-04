/**
 * Shared bootstrap for E2E suites.
 *
 * - Mock DB persists to a JSON file inside a fresh os.tmpdir() folder,
 *   NEVER the real backend/mock-database.json.
 * - AWS clients are always the local mock adapter (no network calls).
 * - Captures a SHA-256 of the real mock-database.json so suites can assert it is untouched.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const pino = require('pino');

const { createApp } = require('../../src/app');
const { InMemoryDatabase } = require('../../src/db/createDatabase');
const { createAwsClients } = require('../../src/services/awsClients');

const ORIGINAL_DB_PATH = path.resolve(__dirname, '..', '..', 'mock-database.json');

function fileHash(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

class IsolatedTestDatabase extends InMemoryDatabase {
  constructor(filePath) {
    super({ filePath, persist: true });
    // Start from a completely empty state (no "Default topic").
    this.topics = new Map();
    this.rubrics = new Map();
    this.rubricCriteria = new Map();
    this.questions = new Map();
    this.evaluations = new Map();
    this.nextTopicId = 1;
    this.nextRubricId = 1;
    this.nextCriterionId = 1;
    this.nextQuestionId = 1;
    this.nextEvaluationId = 1;
  }

  async flush() {
    await this._writePromise;
  }

  async readPersisted() {
    await this.flush();
    return JSON.parse(fs.readFileSync(this.dbFilePath, 'utf8'));
  }
}

function createTestContext(prefix = 'aives-e2e-') {
  const testEnv = {
    awsMockMode: true,
    dbMockMode: true,
    audioBucket: 'test-audio-bucket',
    transcribeOutputBucket: 'test-transcribe-output',
    lambdaFunctionName: 'test-audio-orchestrator',
  };

  const originalDbHash = fileHash(ORIGINAL_DB_PATH);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const testDbPath = path.join(tmpDir, 'mock-database.test.json');

  const db = new IsolatedTestDatabase(testDbPath);
  const clients = createAwsClients(testEnv);
  const app = createApp({
    env: testEnv,
    database: db,
    clients,
    logger: pino({ level: 'silent' }),
  });

  return {
    app,
    db,
    clients,
    testEnv,
    testDbPath,
    originalDbUnchanged: () => fileHash(ORIGINAL_DB_PATH) === originalDbHash,
    async cleanup() {
      await db.flush();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    },
  };
}

module.exports = { createTestContext, ORIGINAL_DB_PATH };
