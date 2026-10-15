const fs = require('fs');
const path = require('path');
const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} = require('@aws-sdk/client-s3');
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
    // In-process object store keyed by `${bucket}/${key}` -> Buffer. Lets the
    // ingestion pipeline round-trip uploads offline without touching S3/MinIO.
    const objectStore = new Map();
    const objectKey = (bucket, key) => `${bucket}/${key}`;

    return {
      async getUploadUrl({ bucket, key }) {
        return `https://mock-s3.local/${bucket}/${key}?signature=mock`;
      },
      async invokeAudioWorkflow(payload) {
        return { accepted: true, payload };
      },
      async putObject({ bucket, key, body }) {
        objectStore.set(objectKey(bucket, key), Buffer.isBuffer(body) ? body : Buffer.from(body));
        return { bucket, key };
      },
      async getObject({ bucket, key }) {
        const value = objectStore.get(objectKey(bucket, key));
        if (value === undefined) {
          const err = new Error(`The specified key does not exist: ${key}`);
          err.code = 'NoSuchKey';
          throw err;
        }
        return value;
      },
      async deleteObject({ bucket, key }) {
        objectStore.delete(objectKey(bucket, key));
        return { bucket, key };
      },
      sessionStore: memoryStore,
      mockMode: true,
    };
  }

  const s3Client = new S3Client({
    region: env.awsRegion,
    endpoint: env.s3Endpoint || undefined,
    forcePathStyle: !!env.s3Endpoint,
  });
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
    async putObject({ bucket, key, body, contentType }) {
      await s3Client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
        }),
      );
      return { bucket, key };
    },
    async getObject({ bucket, key }) {
      const result = await s3Client.send(
        new GetObjectCommand({ Bucket: bucket, Key: key }),
      );
      return Buffer.from(await result.Body.transformToByteArray());
    },
    async deleteObject({ bucket, key }) {
      await s3Client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
      return { bucket, key };
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
