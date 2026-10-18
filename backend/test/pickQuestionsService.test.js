const test = require('node:test');
const assert = require('node:assert/strict');
const { shuffle, pickRandom } = require('../src/interview/pickQuestions');
const { seededRandom } = require('./helpers/interviewFakes');

test('shuffle returns a permutation and does not mutate the input', () => {
  const input = [1, 2, 3, 4, 5, 6];
  const snapshot = [...input];
  const out = shuffle(input, seededRandom(1));
  assert.deepEqual(input, snapshot);
  assert.notEqual(out, input);
  assert.deepEqual([...out].sort((a, b) => a - b), snapshot);
});

test('shuffle is deterministic for the same seed', () => {
  const input = [1, 2, 3, 4, 5, 6, 7, 8];
  assert.deepEqual(shuffle(input, seededRandom(9)), shuffle(input, seededRandom(9)));
});

test('pickRandom returns n distinct items from the list', () => {
  const picked = pickRandom([10, 20, 30, 40, 50], 3, seededRandom(3));
  assert.equal(picked.length, 3);
  assert.equal(new Set(picked).size, 3);
  picked.forEach((id) => assert.ok([10, 20, 30, 40, 50].includes(id)));
});

test('pickRandom with n > length returns every item', () => {
  const picked = pickRandom([1, 2], 5, seededRandom(3));
  assert.deepEqual([...picked].sort(), [1, 2]);
});

test('pickRandom tolerates non-array input and n <= 0', () => {
  assert.deepEqual(pickRandom(null, 3), []);
  assert.deepEqual(pickRandom([1, 2, 3], 0), []);
});
