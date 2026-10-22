// Balanced per-candidate main-question picker (Step 12). Pure: no I/O, the
// randomness source is injected so tests are deterministic.
//
// Goals, in priority order:
//   1. Same Bloom mix for every candidate of an exam: the per-level quota is the
//      lecturer's bloom_distribution, or derived from the bank's proportions by
//      largest remainder (deterministic, so it never varies per candidate).
//   2. No overlap with the K previous consecutive candidates (newest first),
//      K = clamp(floor(bank / n) - 1, 0, 3). When a level cannot be filled the
//      exclusion is relaxed by dropping the OLDEST excluded candidate first.
//   3. Prefer the least-used questions of this exam; ties broken by shuffle.
// A level that is still short after full relaxation is filled from the other
// levels (least used first) and reported in `warnings`.

const { shuffle } = require('./pickQuestions');

const BLOOM_ORDER = ['REMEMBER', 'UNDERSTAND', 'APPLY', 'ANALYZE'];
const UNSPECIFIED = 'UNSPECIFIED';
const MAX_RECENT_WINDOW = 3;

function levelOf(question) {
  return question && question.bloom_level ? String(question.bloom_level).toUpperCase() : UNSPECIFIED;
}

// Stable level order: Bloom order, then UNSPECIFIED, then anything unexpected
// alphabetically.
function compareLevels(a, b) {
  const rank = (l) => {
    const i = BLOOM_ORDER.indexOf(l);
    if (i !== -1) return i;
    return l === UNSPECIFIED ? BLOOM_ORDER.length : BLOOM_ORDER.length + 1;
  };
  return rank(a) - rank(b) || (a < b ? -1 : a > b ? 1 : 0);
}

function countByLevel(bank) {
  const counts = {};
  for (const q of bank || []) {
    const level = levelOf(q);
    counts[level] = (counts[level] || 0) + 1;
  }
  return counts;
}

// Per-level quota summing to min(n, bank.length). An explicit target (object of
// level -> non-negative int) wins; otherwise largest-remainder over the bank's
// level counts, ties broken by level order.
function computeBloomQuota(bank, n, bloomTarget = null) {
  if (bloomTarget && typeof bloomTarget === 'object') {
    const quota = {};
    let sum = 0;
    for (const [level, raw] of Object.entries(bloomTarget)) {
      const count = Math.max(0, Math.floor(Number(raw) || 0));
      if (count > 0) {
        quota[String(level).toUpperCase()] = count;
        sum += count;
      }
    }
    if (sum > 0) return quota;
  }

  const counts = countByLevel(bank);
  const total = (bank || []).length;
  const target = Math.min(Math.max(0, Number(n) || 0), total);
  const quota = {};
  if (target === 0) return quota;
  const levels = Object.keys(counts).sort(compareLevels);
  const remainders = [];
  let assigned = 0;
  for (const level of levels) {
    const exact = (target * counts[level]) / total;
    const base = Math.floor(exact);
    quota[level] = base;
    assigned += base;
    remainders.push({ level, rest: exact - base });
  }
  remainders.sort((a, b) => b.rest - a.rest || compareLevels(a.level, b.level));
  for (let i = 0; assigned < target && i < remainders.length; i += 1) {
    quota[remainders[i].level] += 1;
    assigned += 1;
  }
  for (const level of Object.keys(quota)) {
    if (quota[level] === 0) delete quota[level];
  }
  return quota;
}

function recentWindow(bankSize, n) {
  const per = Number(n) || 0;
  if (per <= 0) return 0;
  return Math.min(MAX_RECENT_WINDOW, Math.max(0, Math.floor(bankSize / per) - 1));
}

function toUsageGetter(usageCounts) {
  if (usageCounts instanceof Map) {
    return (id) => Number(usageCounts.get(id) ?? usageCounts.get(String(id)) ?? usageCounts.get(Number(id))) || 0;
  }
  const obj = usageCounts || {};
  return (id) => Number(obj[id]) || 0;
}

/**
 * @param {{
 *   bank: Array<{ id: number, bloom_level?: string|null }>,
 *   n: number,
 *   recentByCandidate?: Array<Set<number>|number[]>,  // newest first
 *   usageCounts?: Map<number, number>|Record<string, number>,
 *   bloomTarget?: Record<string, number>|null,
 *   random?: () => number,
 * }} args
 * @returns {{ ids: number[], warnings: Array<object> }}
 */
function pickBalancedQuestions({
  bank = [],
  n,
  recentByCandidate = [],
  usageCounts = null,
  bloomTarget = null,
  random = Math.random,
} = {}) {
  const warnings = [];
  const target = Math.min(Math.max(0, Number(n) || 0), bank.length);
  if (target === 0) return { ids: [], warnings };

  const usage = toUsageGetter(usageCounts);
  const k = recentWindow(bank.length, target);
  const recent = (recentByCandidate || []).slice(0, k)
    .map((ids) => new Set([...(ids || [])].map(Number)));
  const quota = computeBloomQuota(bank, target, bloomTarget);
  const chosen = new Set();

  // Excluded ids when keeping the `keep` newest previous candidates.
  const excludedFor = (keep) => {
    const out = new Set();
    for (const set of recent.slice(0, keep)) for (const id of set) out.add(id);
    return out;
  };

  // Least used first; the pre-shuffle (fixed call order -> deterministic per
  // seed) breaks ties at random.
  const rank = (pool) => shuffle(pool, random)
    .sort((a, b) => usage(a.id) - usage(b.id));

  // Take up to `count` from `pool`, relaxing the overlap exclusion from the
  // oldest candidate down to none until enough are eligible.
  const take = (pool, count, label) => {
    const free = pool.filter((q) => !chosen.has(Number(q.id)));
    let keep = recent.length;
    let eligible = free.filter((q) => !excludedFor(keep).has(Number(q.id)));
    while (eligible.length < count && keep > 0) {
      keep -= 1;
      const excl = excludedFor(keep);
      eligible = free.filter((q) => !excl.has(Number(q.id)));
    }
    if (keep < recent.length) {
      warnings.push({
        code: 'OVERLAP_RELAXED', level: label, window: recent.length, kept: keep,
      });
    }
    const picked = rank(eligible).slice(0, count);
    for (const q of picked) chosen.add(Number(q.id));
    return picked.length;
  };

  let shortfall = 0;
  for (const level of Object.keys(quota).sort(compareLevels)) {
    const pool = bank.filter((q) => levelOf(q) === level);
    const got = take(pool, quota[level], level);
    if (got < quota[level]) {
      warnings.push({ code: 'BLOOM_LEVEL_SHORT', level, missing: quota[level] - got });
      shortfall += quota[level] - got;
    }
  }
  // A short level (only possible with an explicit target) is filled from the
  // other levels so the candidate still gets `n` questions.
  const remaining = target - chosen.size;
  if (remaining > 0) {
    const got = take(bank, remaining, null);
    if (shortfall > 0) warnings.push({ code: 'FILLED_FROM_OTHER_LEVELS', count: got });
  }

  // Present in Bloom order (lower-order first) so every candidate gets the same
  // progression; within a level the pick order is kept.
  const byId = new Map(bank.map((q) => [Number(q.id), q]));
  const ids = [...chosen]
    .map((id, i) => ({ id, i, level: levelOf(byId.get(id)) }))
    .sort((a, b) => compareLevels(a.level, b.level) || a.i - b.i)
    .map((x) => x.id)
    .slice(0, target);
  return { ids, warnings };
}

module.exports = {
  pickBalancedQuestions,
  computeBloomQuota,
  countByLevel,
  recentWindow,
  levelOf,
  BLOOM_ORDER,
  UNSPECIFIED,
};
