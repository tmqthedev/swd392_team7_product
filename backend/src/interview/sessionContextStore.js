// SessionContext for live interviews (Step 6), stored through the existing
// DynamoDB abstraction (clients.sessionStore: in-memory on AWS_MOCK_MODE,
// DynamoDB / DynamoDB Local otherwise). Postgres stays the durable record;
// this is fast-moving context only and can always be rebuilt from Postgres.
//
// Item schema (key "interview#<id>" avoids collisions with the legacy audio
// workflow items in the same table):
//   { sessionId, interviewId, examSessionId, studentId, status,
//     currentTurnId, currentAssignedQuestionId, currentQuestionIndex,
//     currentFollowUpCount, deadlineAt, answerDeadlineAt,
//     partialSegments: [{ turnId, seq, text, confidence }],   // current turn only
//     coveredKeyPoints: { [assignedQuestionId]: string[] },
//     expiresAt,  // epoch seconds, DynamoDB TTL attribute
//     updatedAt }
// DynamoDB deletes expired items lazily, so get() also treats an expired item
// as missing.

const TTL_ATTRIBUTE = 'expiresAt';

// DynamoDB's marshaller rejects undefined; a JSON round-trip drops undefined
// keys (and turns Dates into ISO strings).
function toItem(value) {
  return JSON.parse(JSON.stringify(value));
}

class SessionContextStore {
  constructor({
    sessionStore, ttlGraceSec = 86400, clock = () => new Date(), logger = console,
  } = {}) {
    this.sessionStore = sessionStore;
    this.ttlGraceSec = Number(ttlGraceSec) || 0;
    this.clock = clock;
    this.logger = logger;
  }

  key(interviewId) {
    return `interview#${interviewId}`;
  }

  _expiresAt(deadlineAt) {
    const ms = Date.parse(deadlineAt);
    if (Number.isNaN(ms)) return undefined;
    return Math.floor(ms / 1000) + this.ttlGraceSec;
  }

  async get(interviewId) {
    const item = await this.sessionStore.get(this.key(interviewId));
    if (!item) return null;
    if (item.expiresAt != null && Number(item.expiresAt) * 1000 < this.clock().getTime()) {
      return null;
    }
    return item;
  }

  async put(ctx) {
    const deadlineAt = ctx.deadlineAt ? new Date(ctx.deadlineAt).toISOString() : null;
    const item = toItem({
      partialSegments: [],
      coveredKeyPoints: {},
      ...ctx,
      deadlineAt,
      sessionId: this.key(ctx.interviewId),
      expiresAt: deadlineAt ? this._expiresAt(deadlineAt) : undefined,
      updatedAt: this.clock().toISOString(),
    });
    await this.sessionStore.put(item);
    return item;
  }

  async update(interviewId, patch = {}) {
    const next = { ...patch };
    if (next.deadlineAt) {
      next.deadlineAt = new Date(next.deadlineAt).toISOString();
      next.expiresAt = this._expiresAt(next.deadlineAt);
    }
    const item = toItem(next);
    delete item.sessionId;
    if (Object.keys(item).length === 0) return this.get(interviewId);
    // Only touch an existing item: after TTL deletion an upsert would leave a
    // partial stub without expiresAt that get() would return instead of null,
    // blocking the rebuild from Postgres. Missing -> null (caller rebuilds).
    return this.sessionStore.update(this.key(interviewId), item, { onlyIfExists: true });
  }

  // Append a partial transcript segment for the CURRENT turn. Segments for any
  // other turn (late/stale client events) are ignored and return null.
  async appendPartialSegment(interviewId, { turnId, text, confidence } = {}) {
    const ctx = await this.get(interviewId);
    if (!ctx || String(ctx.currentTurnId) !== String(turnId)) return null;
    const segments = (Array.isArray(ctx.partialSegments) ? ctx.partialSegments : [])
      .filter((s) => String(s.turnId) === String(turnId));
    const seq = segments.reduce((max, s) => Math.max(max, Number(s.seq) || 0), 0) + 1;
    const segment = { turnId, seq, text: String(text ?? '') };
    if (confidence != null) segment.confidence = Number(confidence);
    segments.push(segment);
    await this.update(interviewId, { partialSegments: segments });
    return segment;
  }

  async clearPartialSegments(interviewId) {
    return this.update(interviewId, { partialSegments: [] });
  }

  async delete(interviewId) {
    if (typeof this.sessionStore.delete === 'function') {
      await this.sessionStore.delete(this.key(interviewId));
    }
  }

  async ensureTable() {
    if (typeof this.sessionStore.ensureTable !== 'function') return undefined;
    return this.sessionStore.ensureTable({ ttlAttribute: TTL_ATTRIBUTE, logger: this.logger });
  }
}

module.exports = { SessionContextStore, TTL_ATTRIBUTE };
