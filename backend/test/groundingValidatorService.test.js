const test = require('node:test');
const assert = require('node:assert/strict');
const {
  validateGrounding, normalizeForMatch, UNVERIFIED_NOTE,
} = require('../src/interview/groundingValidator');

const CTX = {
  transcriptSoFar: 'Em nghĩ rằng TCP là giao thức HƯỚNG KẾT NỐI, nó đảm bảo   thứ tự gói tin.',
  keyPoints: ['Bắt tay ba bước', 'Kiểm soát luồng'],
  sourceChunks: [
    { chunkId: 11, content: 'TCP establishes a connection using a three-way handshake (SYN, SYN-ACK, ACK).' },
    { chunkId: 12, content: 'Flow control prevents the sender from overwhelming the receiver.' },
  ],
};

test('UNVERIFIED_NOTE is the Vietnamese marker', () => {
  assert.equal(UNVERIFIED_NOTE, 'không xác minh được');
});

test('normalizeForMatch keeps Vietnamese diacritics but drops case/punctuation/space', () => {
  assert.equal(normalizeForMatch('  Hướng   KẾT nối!! '), 'hướng kết nối');
  assert.notEqual(normalizeForMatch('hướng'), normalizeForMatch('huong'));
});

test('STUDENT_QUOTE present (case/punctuation/whitespace-insensitive, diacritics) -> verified', () => {
  const { verified, unverified } = validateGrounding([
    { type: 'STUDENT_QUOTE', text: 'giao thức hướng kết nối' },
    { type: 'STUDENT_QUOTE', text: 'đảm bảo thứ tự gói tin' },
  ], CTX);
  assert.equal(verified.length, 2);
  assert.equal(unverified.length, 0);
  assert.ok(verified.every((g) => g.verified === true));
});

test('STUDENT_QUOTE absent -> unverified with the note and no text', () => {
  const { verified, unverified } = validateGrounding([
    { type: 'STUDENT_QUOTE', ref: null, text: 'UDP is connection-oriented' },
  ], CTX);
  assert.equal(verified.length, 0);
  assert.deepEqual(unverified, [{
    type: 'STUDENT_QUOTE', ref: null, status: 'UNVERIFIED', note: 'không xác minh được',
  }]);
  assert.equal('text' in unverified[0], false);
});

test('SOURCE_EXCERPT in the referenced chunk -> verified', () => {
  const { verified } = validateGrounding([
    { type: 'SOURCE_EXCERPT', ref: 11, text: 'three-way handshake (SYN, SYN-ACK' },
  ], CTX);
  assert.equal(verified.length, 1);
  assert.equal(verified[0].ref, 11);
});

test('SOURCE_EXCERPT whose ref points at a different chunk or an unknown chunk -> unverified', () => {
  const { verified, unverified } = validateGrounding([
    { type: 'SOURCE_EXCERPT', ref: 12, text: 'three-way handshake' },
    { type: 'SOURCE_EXCERPT', ref: 999, text: 'three-way handshake' },
    { type: 'SOURCE_EXCERPT', text: 'text from a non-question chunk' },
  ], CTX);
  assert.equal(verified.length, 0);
  assert.equal(unverified.length, 3);
  assert.ok(unverified.every((u) => u.note === UNVERIFIED_NOTE));
});

test('SOURCE_EXCERPT without ref found in any question chunk -> verified with ref set', () => {
  const { verified } = validateGrounding([
    { type: 'SOURCE_EXCERPT', text: 'prevents the sender from overwhelming' },
  ], CTX);
  assert.equal(verified.length, 1);
  assert.equal(verified[0].ref, 12);
});

test('KEY_POINT match and non-match', () => {
  const { verified, unverified } = validateGrounding([
    { type: 'KEY_POINT', text: 'bắt tay ba bước' },
    { type: 'KEY_POINT', text: 'Mã hóa đầu cuối' },
  ], CTX);
  assert.equal(verified.length, 1);
  assert.equal(unverified.length, 1);
});

test('unknown type, empty text and <3-char text -> unverified', () => {
  const { verified, unverified } = validateGrounding([
    { type: 'OPINION', text: 'giao thức hướng kết nối' },
    { type: 'STUDENT_QUOTE', text: '' },
    { type: 'STUDENT_QUOTE', text: 'nó' },
    null,
  ], CTX);
  assert.equal(verified.length, 0);
  assert.equal(unverified.length, 4);
});

test('non-array input -> empty result', () => {
  assert.deepEqual(validateGrounding(undefined, CTX), { verified: [], unverified: [] });
  assert.deepEqual(validateGrounding('x', CTX), { verified: [], unverified: [] });
});
