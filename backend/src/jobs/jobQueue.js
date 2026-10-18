const { BackgroundJobRepository } = require('../repositories/backgroundJobRepository');

const DEFAULT_BASE_BACKOFF_MS = 1000;
const DEFAULT_BACKOFF_CAP_MS = 60000;
const DEFAULT_LOCK_TIMEOUT_MS = 10 * 60 * 1000;
const RECOVERY_INTERVAL_MS = 60 * 1000;

/**
 * Pure exponential backoff with a cap. Monotonic non-decreasing in `attempt`.
 * attempt is the number of attempts already made (1-based for the first retry).
 * @param {number} attempt attempts made so far (>= 1)
 * @param {number} [baseMs] base delay
 * @param {number} [capMs] maximum delay
 * @returns {number} delay in milliseconds before the next run
 */
function computeBackoffMs(attempt, baseMs = DEFAULT_BASE_BACKOFF_MS, capMs = DEFAULT_BACKOFF_CAP_MS) {
  const n = Math.max(1, Math.floor(attempt));
  const delay = baseMs * 2 ** (n - 1);
  return Math.min(delay, capMs);
}

class JobQueue {
  constructor({ db, repository, env, logger } = {}) {
    this.db = db;
    this.env = env || {};
    this.logger = logger || console;
    this.repository = repository || new BackgroundJobRepository(db);
    this.handlers = new Map();

    this.concurrency = Number(this.env.jobQueueConcurrency) || 2;
    this.pollIntervalMs = Number(this.env.jobQueuePollIntervalMs) || 1000;
    this.baseBackoffMs = Number(this.env.jobQueuePollIntervalMs) || DEFAULT_BASE_BACKOFF_MS;
    this.lockTimeoutMs = Number(this.env.jobLockTimeoutMs) || DEFAULT_LOCK_TIMEOUT_MS;
    this._lastRecoveryAt = 0;

    this.running = false;
    this.inFlight = new Set();
    this._timer = null;
  }

  registerHandler(type, fn) {
    this.handlers.set(type, fn);
    return this;
  }

  async enqueue(type, payload, opts = {}) {
    const maxAttempts = opts.maxAttempts ?? this.env.jobMaxAttempts;
    return this.repository.enqueue(type, payload, { ...opts, maxAttempts });
  }

  start() {
    if (this.running) return;
    this.running = true;
    this._schedule(0);
  }

  async stop() {
    this.running = false;
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    // Wait for all in-flight jobs to settle.
    await Promise.allSettled([...this.inFlight]);
  }

  _schedule(delay) {
    if (!this.running) return;
    this._timer = setTimeout(() => {
      this._tick().catch((err) => {
        this.logger.error({ err }, 'job queue tick failed');
      });
    }, delay);
    if (this._timer.unref) this._timer.unref();
  }

  // Re-queue jobs stranded in RUNNING by a crashed/restarted worker. Handlers
  // must therefore be idempotent: a recovered job may run again from scratch.
  async recoverStale(now = Date.now()) {
    this._lastRecoveryAt = now;
    if (typeof this.repository.requeueStale !== 'function') return [];
    const recovered = await this.repository.requeueStale({
      olderThanMs: this.lockTimeoutMs,
      defaultMaxAttempts: this.env.jobMaxAttempts ?? 3,
    });
    if (recovered.length > 0) {
      this.logger.warn(
        { jobIds: recovered.map((job) => job.background_job_id) },
        'recovered stale RUNNING jobs',
      );
    }
    return recovered;
  }

  async _tick() {
    if (!this.running) return;
    try {
      if (Date.now() - this._lastRecoveryAt >= RECOVERY_INTERVAL_MS) {
        try {
          await this.recoverStale();
        } catch (err) {
          this.logger.error({ err }, 'stale job recovery failed');
        }
      }
      while (this.running && this.inFlight.size < this.concurrency) {
        const job = await this._claim();
        if (!job) break;
        const promise = this._process(job).finally(() => {
          this.inFlight.delete(promise);
        });
        this.inFlight.add(promise);
      }
    } finally {
      this._schedule(this.pollIntervalMs);
    }
  }

  async _claim() {
    // Hold the row lock inside a transaction while we claim the job.
    return this.db.withTransaction((tx) => this.repository.claimNext(tx));
  }

  async _process(job) {
    const handler = this.handlers.get(job.type);
    try {
      if (!handler) {
        throw new Error(`No handler registered for job type ${job.type}`);
      }
      await handler(job);
      await this.repository.markDone(job.background_job_id);
    } catch (err) {
      await this._handleFailure(job, err);
    }
  }

  async _handleFailure(job, err) {
    const message = err && err.message ? err.message : String(err);
    const maxAttempts = job.max_attempts ?? this.env.jobMaxAttempts ?? 3;
    const attempts = job.attempts ?? 0;
    if (attempts < maxAttempts) {
      const nextRunAfter = new Date(Date.now() + computeBackoffMs(attempts, this.baseBackoffMs));
      this.logger.warn(
        { jobId: job.background_job_id, attempts, maxAttempts },
        'job failed, scheduling retry',
      );
      await this.repository.markFailed(job.background_job_id, message, nextRunAfter);
    } else {
      this.logger.error(
        { jobId: job.background_job_id, attempts, maxAttempts },
        'job failed permanently',
      );
      await this.repository.markFailed(job.background_job_id, message, null);
    }
  }
}

module.exports = {
  JobQueue,
  computeBackoffMs,
  DEFAULT_BASE_BACKOFF_MS,
  DEFAULT_BACKOFF_CAP_MS,
  DEFAULT_LOCK_TIMEOUT_MS,
};
