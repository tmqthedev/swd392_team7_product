const fs = require('fs');
const path = require('path');
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');

class InMemorySessionStore {
  constructor() {
    this.store = new Map();
  }

  async put(session) {
    this.store.set(session.sessionId, { ...session });
  }

  async get(sessionId) {
    return this.store.get(sessionId) || null;
  }

  async update(sessionId, patch) {
    const current = this.store.get(sessionId) || { sessionId };
    const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
    this.store.set(sessionId, next);
    return next;
  }
}

class AwsSessionStore {
  constructor(client, tableName) {
    this.client = client;
    this.tableName = tableName;
  }

  async put(session) {
    await this.client.send(new PutCommand({ TableName: this.tableName, Item: session }));
  }

  async get(sessionId) {
    const result = await this.client.send(
      new GetCommand({ TableName: this.tableName, Key: { sessionId } }),
    );
    return result.Item || null;
  }

  async update(sessionId, patch) {
    const updateKeys = Object.keys(patch);
    const expressionNames = {};
    const expressionValues = {};
    const setExpression = updateKeys
      .map((key, idx) => {
        const name = `#k${idx}`;
        const value = `:v${idx}`;
        expressionNames[name] = key;
        expressionValues[value] = patch[key];
        return `${name} = ${value}`;
      })
      .join(', ');

    expressionNames['#updatedAt'] = 'updatedAt';
    expressionValues[':updatedAt'] = new Date().toISOString();

    const result = await this.client.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: { sessionId },
        UpdateExpression: `SET ${setExpression}, #updatedAt = :updatedAt`,
        ExpressionAttributeNames: expressionNames,
        ExpressionAttributeValues: expressionValues,
        ReturnValues: 'ALL_NEW',
      }),
    );

    return result.Attributes;
  }
}

function createAwsClients(env) {
  if (env.awsMockMode) {
    const memoryStore = new InMemorySessionStore();

    return {
      async getUploadUrl({ bucket, key }) {
        return `https://mock-s3.local/${bucket}/${key}?signature=mock`;
      },
      async invokeAudioWorkflow(payload) {
        return { accepted: true, payload };
      },
      sessionStore: memoryStore,
      mockMode: true,
    };
  }

  const s3Client = new S3Client({ region: env.awsRegion });
  const lambdaClient = new LambdaClient({ region: env.awsRegion });
  const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({ region: env.awsRegion }));
  const sessionStore = new AwsSessionStore(dynamo, env.dynamoTableName);

  return {
    async getUploadUrl({ bucket, key }) {
      return getSignedUrl(s3Client, new PutObjectCommand({ Bucket: bucket, Key: key }), {
        expiresIn: 300,
      });
    },
    async invokeAudioWorkflow(payload) {
      const result = await lambdaClient.send(
        new InvokeCommand({
          FunctionName: env.lambdaFunctionName,
          InvocationType: 'Event',
          Payload: Buffer.from(JSON.stringify(payload)),
        }),
      );
      return { accepted: result.StatusCode === 202, statusCode: result.StatusCode };
    },
    sessionStore,
    mockMode: false,
    s3Client,
    getObjectCommand: GetObjectCommand,
  };
}

module.exports = {
  createAwsClients,
};
