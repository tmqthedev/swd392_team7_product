const test = require('node:test');
const assert = require('node:assert/strict');
const {
  pickBalancedQuestions, computeBloomQuota, recentWindow, levelOf,
} = require('../src/interview/pickBalancedQuestions');
const { pickRandom, shuffle } = require('../src/interview/pickQuestions');
const { seededRandom } = require('./helpers/interviewFakes');

// Bank of `spec` = { LEVEL: count }; ids are numbered from 1 in level order.
function makeBank(spec) {
  const bank = [];
  let id = 1;
  for (const [level, count] of Object.entries(spec)) {
    for (let i = 0; i < count; i += 1) {
      bank.push({ id, bloom_level: level === 'NULL' ? null : level });
      id += 1;
    }
  }
  return bank;
}

function mixOf(bank, ids) {
  const byId = new Map(bank.map((q) => [q.id, q]));
  const mix = {};
  for (const id of ids) {
    const level = levelOf(byId.get(id));
    mix[level] = (mix[level] || 0) + 1;
  }
  return mix;
}

// Simulate consecutive candidates the way the engine does: newest first
// history, usage accumulated per exam.
function runCandidates({
  bank, n, candidates, bloomTarget = null, seed = 1,
}) {
  const random = seededRandom(seed);
  const history = [];
  const usage = new Map();
  const picks = [];
  for (let c = 0; c < candidates; c += 1) {
    const { ids, warnings } = pickBalancedQuestions({
      bank, n, recentByCandidate: history, usageCounts: usage, bloomTarget, random,
    });
    picks.push({ ids, warnings });
    history.unshift(ids);
    for (const id of ids) usage.set(id, (usage.get(id) || 0) + 1);
  }
  return picks;
}

test('pickQuestions exports stay intact', () => {
  assert.equal(typeof pickRandom, 'function');
  assert.equal(typeof shuffle, 'function');
});

test('recentWindow: K = clamp(floor(bank / n) - 1, 0, 3)', () => {
  assert.equal(recentWindow(3, 3), 0);
  assert.equal(recentWindow(6, 3), 1);
  assert.equal(recentWindow(9, 3), 2);
  assert.equal(recentWindow(12, 3), 3);
  assert.equal(recentWindow(100, 3), 3);
  assert.equal(recentWindow(5, 0), 0);
});

test('computeBloomQuota: largest remainder over bank proportions, deterministic', () => {
  const bank = makeBank({ REMEMBER: 5, UNDERSTAND: 3, APPLY: 2 });
  assert.deepEqual(computeBloomQuota(bank, 3), { REMEMBER: 1, UNDERSTAND: 1, APPLY: 1 });
  assert.deepEqual(computeBloomQuota(bank, 5), { REMEMBER: 3, UNDERSTAND: 1, APPLY: 1 });
  // An explicit target wins and drops zero counts.
  assert.deepEqual(computeBloomQuota(bank, 3, { APPLY: 2, REMEMBER: 1, ANALYZE: 0 }), { APPLY: 2, REMEMBER: 1 });
  // NULL levels form their own bucket.
  assert.deepEqual(computeBloomQuota(makeBank({ NULL: 2, APPLY: 2 }), 2), { APPLY: 1, UNSPECIFIED: 1 });
});

test('no overlap with the previous K candidates when the bank allows it', () => {
  const bank = makeBank({ REMEMBER: 4, UNDERSTAND: 4, APPLY: 4 }); // 12 / 3 -> K = 3
  const picks = runCandidates({ bank, n: 3, candidates: 10 });
  for (let c = 0; c < picks.length; c += 1) {
    const mine = new Set(picks[c].ids);
    assert.equal(mine.size, 3);
    for (let back = 1; back <= 3 && c - back >= 0; back += 1) {
      const overlap = picks[c - back].ids.filter((id) => mine.has(id));
      assert.deepEqual(overlap, [], `candidate ${c} overlaps candidate ${c - back}`);
    }
    assert.deepEqual(picks[c].warnings, []);
  }
});

test('every candidate gets the same Bloom mix (derived and explicit)', () => {
  const bank = makeBank({ REMEMBER: 6, UNDERSTAND: 4, APPLY: 3, ANALYZE: 2 });
  const derived = runCandidates({ bank, n: 4, candidates: 8 });
  const first = mixOf(bank, derived[0].ids);
  assert.deepEqual(first, computeBloomQuota(bank, 4));
  derived.forEach((p) => assert.deepEqual(mixOf(bank, p.ids), first));

  const explicit = runCandidates({
    bank, n: 4, candidates: 8, bloomTarget: { REMEMBER: 1, UNDERSTAND: 1, APPLY: 1, ANALYZE: 1 },
  });
  explicit.forEach((p) => assert.deepEqual(mixOf(bank, p.ids), {
    REMEMBER: 1, UNDERSTAND: 1, APPLY: 1, ANALYZE: 1,
  }));
});

test('ids come back in Bloom order (lower-order first)', () => {
  const bank = makeBank({ ANALYZE: 2, REMEMBER: 2, APPLY: 2 });
  const { ids } = pickBalancedQuestions({
    bank, n: 3, bloomTarget: { ANALYZE: 1, REMEMBER: 1, APPLY: 1 }, random: seededRandom(3),
  });
  assert.deepEqual(mixOf(bank, ids), { ANALYZE: 1, REMEMBER: 1, APPLY: 1 });
  const levels = ids.map((id) => levelOf(bank.find((q) => q.id === id)));
  assert.deepEqual(levels, ['REMEMBER', 'APPLY', 'ANALYZE']);
});

test('least-used questions are preferred', () => {
  const bank = makeBank({ UNDERSTAND: 6 });
  const usageCounts = new Map([[1, 3], [2, 3], [3, 0], [4, 1], [5, 0], [6, 2]]);
  const { ids } = pickBalancedQuestions({
    bank, n: 3, usageCounts, random: seededRandom(9),
  });
  assert.deepEqual([...ids].sort(), [3, 4, 5]);
  // Plain objects work as usage maps too.
  const again = pickBalancedQuestions({
    bank, n: 2, usageCounts: { 1: 0, 2: 0, 3: 5, 4: 5, 5: 5, 6: 5 }, random: seededRandom(9),
  });
  assert.deepEqual([...again.ids].sort(), [1, 2]);
});

test('small bank: the oldest excluded candidate is dropped first', () => {
  const bank = makeBank({ UNDERSTAND: 6 }); // 6 / 2 -> K = 2
  // Newest first: the newest used 1,2 and the older used 3,4. Exclusions of both
  // leave exactly 5,6.
  const a = pickBalancedQuestions({
    bank, n: 2, recentByCandidate: [[1, 2], [3, 4]], random: seededRandom(1),
  });
  assert.deepEqual([...a.ids].sort(), [5, 6]);
  assert.deepEqual(a.warnings, []);
  // Only 5 is free of both: relax by dropping the OLDEST ([3,4]), never the newest.
  const b = pickBalancedQuestions({
    bank, n: 2, recentByCandidate: [[1, 2, 6], [3, 4]], random: seededRandom(1),
  });
  assert.equal(b.ids.includes(5), true);
  assert.equal(b.ids.some((id) => [1, 2, 6].includes(id)), false);
  assert.ok(b.warnings.some((w) => w.code === 'OVERLAP_RELAXED' && w.kept === 1));
});

test('bank equal to n: every candidate gets the whole bank (K = 0)', () => {
  const bank = makeBank({ REMEMBER: 1, APPLY: 2 });
  const picks = runCandidates({ bank, n: 3, candidates: 3 });
  picks.forEach((p) => assert.deepEqual([...p.ids].sort(), [1, 2, 3]));
});

test('a short level is filled from other levels with a warning', () => {
  const bank = makeBank({ REMEMBER: 4, APPLY: 1 });
  const { ids, warnings } = pickBalancedQuestions({
    bank, n: 3, bloomTarget: { APPLY: 2, REMEMBER: 1 }, random: seededRandom(2),
  });
  assert.equal(ids.length, 3);
  assert.equal(new Set(ids).size, 3);
  assert.deepEqual(mixOf(bank, ids), { APPLY: 1, REMEMBER: 2 });
  assert.ok(warnings.some((w) => w.code === 'BLOOM_LEVEL_SHORT' && w.level === 'APPLY' && w.missing === 1));
  assert.ok(warnings.some((w) => w.code === 'FILLED_FROM_OTHER_LEVELS'));
});

test('deterministic with a seeded random; different seeds differ', () => {
  const bank = makeBank({ REMEMBER: 10, UNDERSTAND: 10 });
  const pick = (seed) => runCandidates({
    bank, n: 4, candidates: 4, seed,
  }).map((p) => p.ids);
  assert.deepEqual(pick(5), pick(5));
  assert.notDeepEqual(pick(5), pick(6));
});

test('n larger than the bank returns the whole bank; n = 0 returns nothing', () => {
  const bank = makeBank({ APPLY: 2 });
  assert.deepEqual([...pickBalancedQuestions({ bank, n: 5 }).ids].sort(), [1, 2]);
  assert.deepEqual(pickBalancedQuestions({ bank, n: 0 }).ids, []);
});
