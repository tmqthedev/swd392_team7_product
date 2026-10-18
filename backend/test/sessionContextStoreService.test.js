const test = require('node:test');
const assert = require('node:assert/strict');
const { SessionContextStore } = require('../src/interview/sessionContextStore');
const {
  InMemorySessionStore, AwsSessionStore, buildDynamoClientConfig,
} = require('../src/services/awsClients');

const START = new Date('2026-01-01T10:00:00.000Z');
const DEADLINE = '2026-01-01T10:30:00.000Z';

function makeStore({ now = START, ttlGraceSec = 3600 } = {}) {
  const clockState = { now };
  const sessionStore = new InMemorySessionStore();
  const store = new SessionContextStore({
    sessionStore, ttlGraceSec, clock: () => clockState.now, logger: { warn() {} },
  });
  return { store, sessionStore, clockState };
}

test('put/get round-trips with the interview# key and computed expiresAt', async () => {
  const { store, sessionStore } = makeStore();
  await store.put({
    interviewId: 9, examSessionId: 3, currentTurnId: 70, deadlineAt: DEADLINE, ignored: undefined,
  });
  const raw = await sessionStore.get('interview#9');
  assert.ok(raw);
  assert.equal(raw.sessionId, 'interview#9');
  assert.equal(raw.expiresAt, Math.floor(Date.parse(DEADLINE) / 1000) + 3600);
  assert.equal('ignored' in raw, false);
  const ctx = await store.get(9);
  assert.equal(ctx.currentTurnId, 70);
  assert.deepEqual(ctx.partialSegments, []);
  assert.deepEqual(ctx.coveredKeyPoints, {});
  assert.equal(await store.get(10), null);
});

test('an expired item reads as missing', async () => {
  const { store, clockState } = makeStore({ ttlGraceSec: 60 });
  await store.put({ interviewId: 9, deadlineAt: DEADLINE });
  clockState.now = new Date(Date.parse(DEADLINE) + 61 * 1000);
  assert.equal(await store.get(9), null);
});

test('update merges and recomputes expiresAt when the deadline changes', async () => {
  const { store } = makeStore();
  await store.put({ interviewId: 9, deadlineAt: DEADLINE, currentTurnId: 1 });
  await store.update(9, { currentTurnId: 2, coveredKeyPoints: { 5: ['a'] } });
  let ctx = await store.get(9);
  assert.equal(ctx.currentTurnId, 2);
  assert.deepEqual(ctx.coveredKeyPoints, { 5: ['a'] });
  assert.equal(ctx.deadlineAt, DEADLINE);
  await store.update(9, { deadlineAt: '2026-01-01T10:10:00.000Z' });
  ctx = await store.get(9);
  assert.equal(ctx.expiresAt, Math.floor(Date.parse('2026-01-01T10:10:00.000Z') / 1000) + 3600);
});

test('update on a missing item is a no-op (no stub that would block the rebuild)', async () => {
  const { store, sessionStore } = makeStore();
  assert.equal(await store.update(9, { status: 'COMPLETED', partialSegments: [] }), null);
  assert.equal(await sessionStore.get('interview#9'), null);
  // Legacy audio-workflow callers keep upsert semantics.
  await sessionStore.update('legacy-1', { status: 'PROCESSING' });
  assert.equal((await sessionStore.get('legacy-1')).status, 'PROCESSING');
});

test('AwsSessionStore.update onlyIfExists: conditional write, missing item -> null', async () => {
  const sent = [];
  const failed = new Error('The conditional request failed');
  failed.name = 'ConditionalCheckFailedException';
  const doc = { async send(cmd) { sent.push(cmd.input); throw failed; } };
  const store = new AwsSessionStore(doc, 't');
  assert.equal(await store.update('interview#9', { status: 'X' }, { onlyIfExists: true }), null);
  assert.equal(sent[0].ConditionExpression, 'attribute_exists(#pk)');
  assert.equal(sent[0].ExpressionAttributeNames['#pk'], 'sessionId');
  // Without the option the error is not swallowed and no condition is sent.
  await assert.rejects(() => store.update('interview#9', { status: 'X' }), /conditional/);
  assert.equal(sent[1].ConditionExpression, undefined);
});

test('appendPartialSegment assigns seq and ignores other-turn segments', async () => {
  const { store } = makeStore();
  await store.put({ interviewId: 9, deadlineAt: DEADLINE, currentTurnId: 70 });
  const s1 = await store.appendPartialSegment(9, { turnId: 70, text: 'hello', confidence: 0.8 });
  const s2 = await store.appendPartialSegment(9, { turnId: 70, text: 'world' });
  const stale = await store.appendPartialSegment(9, { turnId: 69, text: 'late' });
  assert.equal(s1.seq, 1);
  assert.equal(s2.seq, 2);
  assert.equal(stale, null);
  const ctx = await store.get(9);
  assert.deepEqual(ctx.partialSegments.map((s) => s.text), ['hello', 'world']);
  assert.equal(ctx.partialSegments[0].confidence, 0.8);
});

test('clearPartialSegments empties the list; delete removes the item', async () => {
  const { store } = makeStore();
  await store.put({ interviewId: 9, deadlineAt: DEADLINE, currentTurnId: 70 });
  await store.appendPartialSegment(9, { turnId: 70, text: 'x' });
  await store.clearPartialSegments(9);
  assert.deepEqual((await store.get(9)).partialSegments, []);
  await store.delete(9);
  assert.equal(await store.get(9), null);
});

test('buildDynamoClientConfig includes the endpoint only when set', () => {
  assert.deepEqual(buildDynamoClientConfig({ awsRegion: 'ap-southeast-1' }), { region: 'ap-southeast-1' });
  assert.deepEqual(
    buildDynamoClientConfig({ awsRegion: 'ap-southeast-1', dynamodbEndpoint: 'http://dynamodb:8000' }),
    { region: 'ap-southeast-1', endpoint: 'http://dynamodb:8000' },
  );
});

function fakeRawClient(script) {
  const calls = [];
  return {
    calls,
    async send(command) {
      const name = command.constructor.name;
      calls.push({ name, input: command.input });
      const handler = script[name];
      const next = Array.isArray(handler) ? handler.shift() : handler;
      if (next instanceof Error) throw next;
      return typeof next === 'function' ? next(command) : next;
    },
  };
}

function namedError(name) {
  const err = new Error(name);
  err.name = name;
  return err;
}

test('AwsSessionStore.ensureTable creates a missing table, waits for ACTIVE, enables TTL', async () => {
  const raw = fakeRawClient({
    DescribeTableCommand: [
      namedError('ResourceNotFoundException'),
      { Table: { TableStatus: 'CREATING' } },
      { Table: { TableStatus: 'ACTIVE' } },
    ],
    CreateTableCommand: {},
    UpdateTimeToLiveCommand: {},
  });
  const store = new AwsSessionStore({}, 'viva-session-context', raw, { sleep: async () => {} });
  const result = await store.ensureTable({ ttlAttribute: 'expiresAt', logger: { warn() {} } });
  assert.deepEqual(result, { created: true });
  assert.deepEqual(raw.calls.map((c) => c.name), [
    'DescribeTableCommand', 'CreateTableCommand', 'DescribeTableCommand', 'DescribeTableCommand',
    'UpdateTimeToLiveCommand',
  ]);
  const create = raw.calls[1].input;
  assert.equal(create.TableName, 'viva-session-context');
  assert.equal(create.BillingMode, 'PAY_PER_REQUEST');
  assert.deepEqual(create.KeySchema, [{ AttributeName: 'sessionId', KeyType: 'HASH' }]);
  assert.deepEqual(raw.calls[4].input.TimeToLiveSpecification, { AttributeName: 'expiresAt', Enabled: true });
});

test('AwsSessionStore.ensureTable enables TTL on an existing table without creating it', async () => {
  const raw = fakeRawClient({
    DescribeTableCommand: { Table: { TableStatus: 'ACTIVE' } },
    UpdateTimeToLiveCommand: {},
  });
  const store = new AwsSessionStore({}, 't', raw);
  assert.deepEqual(await store.ensureTable({ logger: { warn() {} } }), { created: false });
  assert.deepEqual(raw.calls.map((c) => c.name), ['DescribeTableCommand', 'UpdateTimeToLiveCommand']);
  assert.deepEqual(raw.calls[1].input.TimeToLiveSpecification, { AttributeName: 'expiresAt', Enabled: true });
});

test('AwsSessionStore.ensureTable: TTL already enabled on an existing table is silent', async () => {
  const already = namedError('ValidationException');
  already.message = 'TimeToLive is already enabled';
  const raw = fakeRawClient({
    DescribeTableCommand: { Table: { TableStatus: 'ACTIVE' } },
    UpdateTimeToLiveCommand: already,
  });
  const warnings = [];
  const store = new AwsSessionStore({}, 't', raw);
  assert.deepEqual(
    await store.ensureTable({ logger: { warn: (...args) => warnings.push(args) } }),
    { created: false },
  );
  assert.equal(warnings.length, 0);
});

test('AwsSessionStore.ensureTable tolerates a TTL failure (warn logged)', async () => {
  const raw = fakeRawClient({
    DescribeTableCommand: [namedError('ResourceNotFoundException'), { Table: { TableStatus: 'ACTIVE' } }],
    CreateTableCommand: {},
    UpdateTimeToLiveCommand: namedError('ValidationException'),
  });
  const warnings = [];
  const store = new AwsSessionStore({}, 't', raw, { sleep: async () => {} });
  await store.ensureTable({ logger: { warn: (...args) => warnings.push(args) } });
  assert.equal(warnings.length, 1);
});

test('AwsSessionStore.ensureTable rethrows unexpected Describe errors', async () => {
  const raw = fakeRawClient({ DescribeTableCommand: namedError('AccessDeniedException') });
  const store = new AwsSessionStore({}, 't', raw);
  await assert.rejects(() => store.ensureTable(), /AccessDeniedException/);
});

test('in-memory ensureTable resolves; SessionContextStore delegates', async () => {
  const { store } = makeStore();
  await assert.doesNotReject(() => store.ensureTable());
});
