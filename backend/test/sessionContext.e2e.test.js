/**
 * Step 6 SessionContext smoke against DynamoDB Local (Jest).
 *
 * Self-skips when TEST_DYNAMODB_ENDPOINT is unset, keeping `npm run test:e2e`
 * green offline. Run it:
 *   docker compose up -d dynamodb
 *   $env:TEST_DYNAMODB_ENDPOINT='http://localhost:8000'
 *   npm run test:e2e
 *
 * Exercises the real (non-mock) createAwsClients path: AwsSessionStore
 * ensureTable (create + ACTIVE wait + TTL enable, idempotent on re-run) and the
 * SessionContextStore item round-trip through the real DynamoDB marshaller.
 */
const {
  DynamoDBClient, DescribeTimeToLiveCommand, DeleteTableCommand,
} = require('@aws-sdk/client-dynamodb');

const { createAwsClients } = require('../src/services/awsClients');
const { SessionContextStore, TTL_ATTRIBUTE } = require('../src/interview/sessionContextStore');

const ENDPOINT = process.env.TEST_DYNAMODB_ENDPOINT;
const describeDynamo = ENDPOINT ? describe : describe.skip;

describeDynamo('session context e2e (requires DynamoDB Local)', () => {
  jest.setTimeout(60000);

  const region = 'us-east-1';
  const tableName = `viva-session-context-e2e-${Date.now()}`;
  const savedCreds = {};
  let raw;
  let clients;
  let warnings;
  let logger;

  beforeAll(() => {
    // DynamoDB Local accepts any credentials, but the SDK refuses to sign
    // without some. Only fill them in when absent; restored in afterAll.
    for (const key of ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY']) {
      savedCreds[key] = process.env[key];
      if (!process.env[key]) process.env[key] = 'local';
    }
    raw = new DynamoDBClient({ region, endpoint: ENDPOINT });
    clients = createAwsClients({
      awsMockMode: false, awsRegion: region, dynamodbEndpoint: ENDPOINT, dynamoTableName: tableName,
    });
    warnings = [];
    logger = { warn: (...args) => warnings.push(args), info() {} };
  });

  afterAll(async () => {
    try {
      if (raw) await raw.send(new DeleteTableCommand({ TableName: tableName }));
    } catch (_) { /* best-effort cleanup */ }
    for (const [key, value] of Object.entries(savedCreds)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  test('ensureTable creates the table and enables TTL; re-run is idempotent', async () => {
    const store = new SessionContextStore({ sessionStore: clients.sessionStore, logger });
    const first = await store.ensureTable();
    expect(first).toEqual({ created: true });

    const ttl = await raw.send(new DescribeTimeToLiveCommand({ TableName: tableName }));
    expect(ttl.TimeToLiveDescription.AttributeName).toBe(TTL_ATTRIBUTE);
    expect(['ENABLED', 'ENABLING']).toContain(ttl.TimeToLiveDescription.TimeToLiveStatus);

    const second = await store.ensureTable();
    expect(second).toEqual({ created: false });
    expect(warnings).toEqual([]);
  });

  test('context round-trips through the real marshaller with TTL + partial segments', async () => {
    // Real-time-relative deadline: DynamoDB Local's TTL reaper deletes items
    // whose expiresAt is already in the past.
    const now = new Date();
    const store = new SessionContextStore({
      sessionStore: clients.sessionStore, ttlGraceSec: 60, clock: () => now, logger,
    });
    const deadlineAt = new Date(now.getTime() + 30 * 60 * 1000).toISOString();
    await store.put({
      interviewId: 42,
      examSessionId: 7,
      studentId: 9,
      status: 'IN_PROGRESS',
      currentTurnId: 100,
      currentQuestionIndex: 0,
      currentFollowUpCount: 0,
      deadlineAt,
      answerDeadlineAt: undefined, // dropped, not rejected by the marshaller
    });

    let ctx = await store.get(42);
    expect(ctx.sessionId).toBe('interview#42');
    expect(ctx.deadlineAt).toBe(deadlineAt);
    expect(ctx.expiresAt).toBe(Math.floor(Date.parse(deadlineAt) / 1000) + 60);
    expect(ctx.partialSegments).toEqual([]);

    await store.appendPartialSegment(42, { turnId: 100, text: 'first part', confidence: 0.9 });
    await store.appendPartialSegment(42, { turnId: 100, text: 'second part' });
    expect(await store.appendPartialSegment(42, { turnId: 999, text: 'stale' })).toBeNull();
    ctx = await store.get(42);
    expect(ctx.partialSegments.map((s) => [s.seq, s.text])).toEqual([[1, 'first part'], [2, 'second part']]);

    await store.update(42, { currentFollowUpCount: 1, coveredKeyPoints: { 5: ['handshake'] } });
    ctx = await store.get(42);
    expect(ctx.currentFollowUpCount).toBe(1);
    expect(ctx.coveredKeyPoints).toEqual({ 5: ['handshake'] });

    // Past expiresAt the store reports the item as missing (DynamoDB TTL is lazy).
    const later = new SessionContextStore({
      sessionStore: clients.sessionStore,
      clock: () => new Date(Date.parse(deadlineAt) + 61 * 1000),
    });
    expect(await later.get(42)).toBeNull();

    await store.delete(42);
    expect(await clients.sessionStore.get('interview#42')).toBeNull();
  });

  test('update on a missing (TTL-deleted) item does not upsert a stub', async () => {
    const store = new SessionContextStore({ sessionStore: clients.sessionStore, logger });
    expect(await store.update(77, { status: 'COMPLETED', partialSegments: [] })).toBeNull();
    expect(await clients.sessionStore.get('interview#77')).toBeNull();
    expect(await store.get(77)).toBeNull();
  });
});
