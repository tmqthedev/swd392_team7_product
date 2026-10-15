// Pure, dependency-free text chunker for ingestion. Splits each parsed segment
// (a page/slide, or the whole document for DOCX) into ~targetWords chunks with
// a trailing overlapWords window carried into the next chunk of the SAME
// segment. Overlap never crosses a segment boundary (page/slide), so a chunk's
// location is always well defined. A running chunk_no spans the whole document.
//
// Input segments: [{ page: number|null, text: string }]
// Output chunks:  [{ chunk_no, location, content }]
//   location is `page N` / `slide N` depending on the caller's labeller, or
//   null when the segment carries no page (DOCX). We derive the label from the
//   presence of `page`: callers pass page=slide number for PPTX too, and set
//   locationKind to control the prefix word.

function splitWords(text) {
  return String(text ?? '')
    .split(/\s+/)
    .filter((w) => w.length > 0);
}

/**
 * Chunk an array of parsed segments.
 * @param {Array<{page: number|null, text: string}>} segments
 * @param {{targetWords?: number, overlapWords?: number, locationKind?: string}} [options]
 *   locationKind: 'page' (default) or 'slide'. Only used when a segment has a
 *   non-null page; a null page yields a null location (DOCX).
 * @returns {Array<{chunk_no: number, location: string|null, content: string}>}
 */
function chunkSegments(segments, options = {}) {
  const targetWords = Number(options.targetWords) > 0 ? Math.floor(options.targetWords) : 500;
  const overlapWordsRaw = Number(options.overlapWords) >= 0 ? Math.floor(options.overlapWords) : 50;
  // Overlap must be strictly smaller than the target to guarantee progress.
  const overlapWords = Math.min(overlapWordsRaw, Math.max(0, targetWords - 1));
  const locationKind = options.locationKind === 'slide' ? 'slide' : 'page';

  const chunks = [];
  let chunkNo = 0;

  for (const segment of segments || []) {
    const words = splitWords(segment && segment.text);
    if (words.length === 0) continue;

    const page = segment ? segment.page : null;
    const location = page == null ? null : `${locationKind} ${page}`;

    let start = 0;
    while (start < words.length) {
      const end = Math.min(start + targetWords, words.length);
      const content = words.slice(start, end).join(' ');
      chunkNo += 1;
      chunks.push({ chunk_no: chunkNo, location, content });

      if (end >= words.length) break;
      // Carry the overlap window into the next chunk of this same segment.
      start = end - overlapWords;
    }
  }

  return chunks;
}

module.exports = { chunkSegments };
