// Shared random picker for main-question selection (Chon cau chinh). The
// randomness source is injected so callers (ExamSessionService, the interview
// engine) and their tests can be deterministic with a seeded generator.

// Return a shuffled COPY of `list` (Fisher-Yates). Never mutates the input.
function shuffle(list, random = Math.random) {
  const pool = Array.isArray(list) ? [...list] : [];
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool;
}

// Pick up to `n` distinct items at random. Returns every item (shuffled) when
// `n` exceeds the list length.
function pickRandom(list, n, random = Math.random) {
  return shuffle(list, random).slice(0, Math.max(0, Number(n) || 0));
}

module.exports = { shuffle, pickRandom };
