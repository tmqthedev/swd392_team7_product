// Shared chunk formatting and sanitization for LLM prompts.

function sanitizeChunkContent(text) {
  return String(text ?? '').replace(/<<<\s*(END\s+)?CHUNK[^>]*>>>/gi, '[delimiter removed]');
}

function buildChunkBlocks(chunks) {
  return (chunks || [])
    .map((chunk) => {
      const location = chunk.location ? ` (${chunk.location})` : '';
      const safe = sanitizeChunkContent(chunk.content);
      return `<<<CHUNK ${chunk.chunk_id || chunk.chunkId}${location}>>>\n${safe}\n<<<END CHUNK ${chunk.chunk_id || chunk.chunkId}>>>`;
    })
    .join('\n\n');
}

module.exports = {
  sanitizeChunkContent,
  buildChunkBlocks,
};
