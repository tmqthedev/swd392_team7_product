// Grounding validation for rationale citations (Step 6). A citation is kept
// only when it can be verified against data the engine holds:
//   STUDENT_QUOTE  -> must appear in this interview's transcript so far
//   SOURCE_EXCERPT -> must appear in one of the question's source chunks
//   KEY_POINT      -> must match one of the question's key points
// Anything else is dropped and recorded as unverified with the fixed note
// 'không xác minh được'. The unverified text itself is never kept, so an
// invented quote cannot reach a lecturer view dressed up as evidence.

const UNVERIFIED_NOTE = 'không xác minh được';
const MIN_MATCH_LENGTH = 3;
const GROUNDING_TYPES = ['STUDENT_QUOTE', 'SOURCE_EXCERPT', 'KEY_POINT'];

// Case/punctuation/whitespace-insensitive form that keeps Vietnamese
// diacritics (NFC + Unicode letter/number classes).
function normalizeForMatch(s) {
  return String(s ?? '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function unverifiedEntry(g) {
  const type = g && typeof g.type === 'string' ? g.type : null;
  const ref = g && g.ref != null ? g.ref : null;
  return {
    type, ref, status: 'UNVERIFIED', note: UNVERIFIED_NOTE,
  };
}

function validateGrounding(grounding, { transcriptSoFar = '', keyPoints = [], sourceChunks = [] } = {}) {
  const verified = [];
  const unverified = [];
  if (!Array.isArray(grounding)) return { verified, unverified };

  const transcriptNorm = normalizeForMatch(transcriptSoFar);
  const chunks = Array.isArray(sourceChunks) ? sourceChunks : [];
  const points = Array.isArray(keyPoints) ? keyPoints : [];

  for (const g of grounding) {
    if (!g || typeof g !== 'object') {
      unverified.push(unverifiedEntry(null));
      continue;
    }
    const t = normalizeForMatch(g.text);
    if (t.length < MIN_MATCH_LENGTH) {
      unverified.push(unverifiedEntry(g));
      continue;
    }
    const text = String(g.text);
    if (g.type === 'STUDENT_QUOTE') {
      if (transcriptNorm.includes(t)) {
        verified.push({
          type: g.type, ref: g.ref ?? null, text, verified: true,
        });
      } else {
        unverified.push(unverifiedEntry(g));
      }
    } else if (g.type === 'SOURCE_EXCERPT') {
      const candidates = g.ref != null
        ? chunks.filter((c) => String(c.chunkId) === String(g.ref))
        : chunks;
      const match = candidates.find((c) => normalizeForMatch(c.content).includes(t));
      if (match) {
        verified.push({
          type: g.type, ref: match.chunkId, text, verified: true,
        });
      } else {
        unverified.push(unverifiedEntry(g));
      }
    } else if (g.type === 'KEY_POINT') {
      const hit = points.some((kp) => {
        const norm = normalizeForMatch(kp);
        return norm === t || norm.includes(t);
      });
      if (hit) {
        verified.push({
          type: g.type, ref: g.ref ?? null, text, verified: true,
        });
      } else {
        unverified.push(unverifiedEntry(g));
      }
    } else {
      unverified.push(unverifiedEntry(g));
    }
  }
  return { verified, unverified };
}

module.exports = {
  UNVERIFIED_NOTE,
  GROUNDING_TYPES,
  normalizeForMatch,
  validateGrounding,
};
