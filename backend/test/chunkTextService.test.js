const test = require('node:test');
const assert = require('node:assert/strict');
const { chunkSegments } = require('../src/ingest/chunkText');

function words(n, prefix = 'w') {
  return Array.from({ length: n }, (_, i) => `${prefix}${i}`).join(' ');
}

test('a short segment produces exactly one chunk with chunk_no 1', () => {
  const chunks = chunkSegments([{ page: 1, text: 'hello world from a slide' }]);
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].chunk_no, 1);
  assert.equal(chunks[0].location, 'page 1');
  assert.equal(chunks[0].content, 'hello world from a slide');
});

test('a long segment splits into ~target-word chunks with carried overlap', () => {
  const chunks = chunkSegments(
    [{ page: 2, text: words(120) }],
    { targetWords: 50, overlapWords: 10 },
  );
  // 120 words, target 50, overlap 10 => step 40: starts at 0,40,80 => 3 chunks.
  assert.equal(chunks.length, 3);
  assert.equal(chunks[0].chunk_no, 1);
  assert.equal(chunks[2].chunk_no, 3);
  // Overlap: the last 10 words of chunk 1 are the first 10 of chunk 2.
  const c0 = chunks[0].content.split(' ');
  const c1 = chunks[1].content.split(' ');
  assert.deepEqual(c0.slice(40), c1.slice(0, 10));
});

test('overlap never crosses a segment boundary and chunk_no is document-wide', () => {
  const chunks = chunkSegments(
    [
      { page: 1, text: words(60, 'a') },
      { page: 2, text: words(60, 'b') },
    ],
    { targetWords: 50, overlapWords: 10 },
  );
  // Each 60-word segment -> 2 chunks (0..50, 10..60). 4 chunks total.
  assert.equal(chunks.length, 4);
  assert.deepEqual(chunks.map((c) => c.chunk_no), [1, 2, 3, 4]);
  // No chunk mixes 'a' and 'b' words -> overlap did not cross the boundary.
  for (const chunk of chunks) {
    const hasA = chunk.content.includes('a0');
    const hasB = chunk.content.includes('b0');
    assert.ok(!(hasA && hasB), 'a chunk must not span two segments');
  }
  // Locations follow the originating segment.
  assert.equal(chunks[0].location, 'page 1');
  assert.equal(chunks[3].location, 'page 2');
});

test('locationKind "slide" and null page produce the right location labels', () => {
  const slide = chunkSegments([{ page: 3, text: 'x y z' }], { locationKind: 'slide' });
  assert.equal(slide[0].location, 'slide 3');

  const docx = chunkSegments([{ page: null, text: 'x y z' }]);
  assert.equal(docx[0].location, null);
});

test('empty / whitespace-only segments are skipped', () => {
  const chunks = chunkSegments([
    { page: 1, text: '   ' },
    { page: 2, text: '' },
    { page: 3, text: 'real content' },
  ]);
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].location, 'page 3');
  assert.equal(chunks[0].chunk_no, 1);
});
