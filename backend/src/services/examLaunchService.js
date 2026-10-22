// Exam launch side effects (Step 12), run after an ADMIN starts an exam:
//   * warm the STT and TTS Lambdas for the exam language, in parallel;
//   * enqueue PREPARE_EXAM_AUDIO (TTS for every APPROVED question of the topic);
//   * enqueue the first KEEP_WARM ping (it re-enqueues itself every interval
//     until the exam closes).
// Progress is written to exam_session.warm_status:
//   { stt:{ok,ms,at,error?}, tts:{ok,ms,at,error?},
//     audio:{done,total,state}, keepWarm:{state,nextAt} }
// launch() NEVER throws: the exam is already OPEN and a provider problem must
// not undo that. Errors are logged and reflected in warm_status.

const DEFAULT_KEEP_WARM_INTERVAL_MS = 5 * 60 * 1000;

// exam_session.language is 'VI' | 'EN'; the adapters take 'vi' | 'en'.
function adapterLanguage(language) {
  return String(language || 'VI').toUpperCase() === 'EN' ? 'en' : 'vi';
}

class ExamLaunchService {
  constructor({
    sttAdapter,
    ttsAdapter,
    examSessionRepository,
    enqueueJob,
    clock = () => new Date(),
    logger = console,
    keepWarmIntervalMs = DEFAULT_KEEP_WARM_INTERVAL_MS,
  } = {}) {
    this.sttAdapter = sttAdapter;
    this.ttsAdapter = ttsAdapter;
    this.examSessionRepository = examSessionRepository;
    this.enqueueJob = enqueueJob;
    this.clock = clock;
    this.logger = logger;
    this.keepWarmIntervalMs = Number(keepWarmIntervalMs) > 0
      ? Number(keepWarmIntervalMs)
      : DEFAULT_KEEP_WARM_INTERVAL_MS;
  }

  nextKeepWarmAt() {
    return new Date(this.clock().getTime() + this.keepWarmIntervalMs);
  }

  // Order matters: the fast writes and the enqueues come first so the audio
  // job is not delayed by a cold Lambda; the warm-up result then merges only
  // stt/tts, never clobbering the audio progress the job writes. Each step is
  // isolated so one failure does not skip the others.
  async launch(session) {
    const examSessionId = session && session.exam_session_id;
    const nextAt = this.nextKeepWarmAt();
    await this._safe('warm status init', examSessionId, async () => {
      const total = await this._countAudio(session);
      await this.examSessionRepository.mergeWarmStatus(examSessionId, {
        stt: { ok: null, ms: null, at: null },
        tts: { ok: null, ms: null, at: null },
        audio: { done: 0, total, state: total > 0 ? 'pending' : 'done' },
        keepWarm: { state: 'active', nextAt: nextAt.toISOString() },
      });
    });
    await this._safe('enqueue PREPARE_EXAM_AUDIO', examSessionId, () => (
      this._enqueue('PREPARE_EXAM_AUDIO', { examSessionId })));
    await this._safe('enqueue KEEP_WARM', examSessionId, () => (
      this._enqueue('KEEP_WARM', { examSessionId }, { runAfter: nextAt })));
    await this._safe('warm-up', examSessionId, async () => {
      const warm = await this._warmBoth(session.language);
      await this.examSessionRepository.mergeWarmStatus(examSessionId, warm);
    });
  }

  async _safe(step, examSessionId, fn) {
    try {
      await fn();
    } catch (err) {
      this.logger.error({ err, examSessionId, step }, 'exam launch step failed');
    }
  }

  // Manual re-warm (admin). Updates only warm_status.stt/tts and returns the
  // merged warm_status. Throws only when the status write itself fails.
  async warm(session) {
    const warm = await this._warmBoth(session.language);
    const updated = await this.examSessionRepository.mergeWarmStatus(session.exam_session_id, warm);
    return (updated && updated.warm_status) || warm;
  }

  // Both warm-ups in parallel; each is timed and its failure captured so one
  // provider never hides the other's result.
  async _warmBoth(language) {
    const lang = adapterLanguage(language);
    const [stt, tts] = await Promise.allSettled([
      this._timed(this.sttAdapter, lang),
      this._timed(this.ttsAdapter, lang),
    ]);
    return { stt: this._settledToStatus(stt), tts: this._settledToStatus(tts) };
  }

  async _timed(adapter, lang) {
    const started = Date.now();
    if (!adapter || typeof adapter.warmUp !== 'function') {
      return { ok: true, ms: 0, skipped: true };
    }
    const result = await adapter.warmUp(lang);
    return { ...(result || {}), ms: result && Number.isFinite(result.ms) ? result.ms : Date.now() - started };
  }

  _settledToStatus(settled) {
    const at = this.clock().toISOString();
    if (settled.status === 'rejected') {
      const err = settled.reason;
      return {
        ok: false, ms: null, at, error: (err && err.message) || String(err),
      };
    }
    const value = settled.value || {};
    const out = { ok: value.ok !== false, ms: value.ms ?? null, at };
    if (value.error) out.error = String(value.error);
    return out;
  }

  async _countAudio(session) {
    if (typeof this.examSessionRepository.countApprovedQuestionsInTopic !== 'function') return 0;
    return Number(await this.examSessionRepository.countApprovedQuestionsInTopic(session.topic_id)) || 0;
  }

  async _enqueue(type, payload, options) {
    if (typeof this.enqueueJob !== 'function') return null;
    return options ? this.enqueueJob(type, payload, options) : this.enqueueJob(type, payload);
  }
}

module.exports = {
  ExamLaunchService,
  adapterLanguage,
  DEFAULT_KEEP_WARM_INTERVAL_MS,
};
