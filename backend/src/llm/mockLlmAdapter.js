// Deterministic mock LLM adapter for offline/test generation. Produces exactly
// `requestedCount` drafts with no network call. Each draft i cites chunks[i % n]
// and copies that chunk's first ~15 words verbatim into citations[0].excerpt so
// it passes the grounding/excerpt-substring validation by construction. The
// bloom_level walks the requested distribution (expanded to a flat list) and
// falls back to a round-robin over the Bloom enum when no distribution is given.

const BLOOM_LEVELS = ['REMEMBER', 'UNDERSTAND', 'APPLY', 'ANALYZE'];

// Expand a { REMEMBER: 2, APPLY: 1 } distribution into a flat ['REMEMBER',
// 'REMEMBER', 'APPLY'] list the drafts can walk in order. Unknown/zero keys are
// skipped. Returns null when there is nothing usable so the caller round-robins.
function expandDistribution(bloomDistribution) {
  if (!bloomDistribution || typeof bloomDistribution !== 'object') return null;
  const flat = [];
  for (const level of BLOOM_LEVELS) {
    const n = Number(bloomDistribution[level]);
    if (Number.isInteger(n) && n > 0) {
      for (let i = 0; i < n; i += 1) flat.push(level);
    }
  }
  return flat.length > 0 ? flat : null;
}

function firstWords(text, count) {
  return String(text ?? '')
    .trim()
    .split(/\s+/)
    .slice(0, count)
    .join(' ');
}

class MockLlmAdapter {
  async generateQuestions({
    language = 'en',
    topic = {},
    bloomDistribution = null,
    requestedCount = 0,
    chunks = [],
  } = {}) {
    const topicName = (topic && topic.name) || 'the topic';
    const n = Array.isArray(chunks) ? chunks.length : 0;
    if (n === 0 || requestedCount <= 0) return [];

    const bloomPlan = expandDistribution(bloomDistribution);
    const drafts = [];
    for (let i = 0; i < requestedCount; i += 1) {
      const chunk = chunks[i % n];
      const bloomLevel = bloomPlan
        ? bloomPlan[i % bloomPlan.length]
        : BLOOM_LEVELS[i % BLOOM_LEVELS.length];
      const excerpt = firstWords(chunk.content, 15);
      drafts.push({
        content: `[${language}] Regarding ${topicName}: question ${i + 1} grounded in the source material.`,
        bloom_level: bloomLevel,
        reference_answer: `A model answer for question ${i + 1} about ${topicName}.`,
        key_points: [
          `Key point A for question ${i + 1}`,
          `Key point B for question ${i + 1}`,
          `Key point C for question ${i + 1}`,
        ],
        citations: [{ chunk_id: chunk.chunk_id, excerpt }],
        purpose: `Assess understanding of ${topicName} (draft ${i + 1}).`,
        synthesis: `Synthesized from source chunk ${chunk.chunk_id}.`,
      });
    }
    return drafts;
  }
}

function createMockLlmAdapter() {
  return new MockLlmAdapter();
}

module.exports = {
  MockLlmAdapter,
  createMockLlmAdapter,
  BLOOM_LEVELS,
};
