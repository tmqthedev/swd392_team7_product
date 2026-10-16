const test = require('node:test');
const assert = require('node:assert/strict');
const {
  STATUSES,
  TRANSITIONS,
  canTransition,
  assertTransition,
} = require('../src/domain/examSessionStatus');

test('STATUSES and TRANSITIONS describe DRAFT->OPEN->CLOSED', () => {
  assert.deepEqual(STATUSES, ['DRAFT', 'OPEN', 'CLOSED']);
  assert.deepEqual(TRANSITIONS, {
    DRAFT: ['OPEN'],
    OPEN: ['CLOSED'],
    CLOSED: [],
  });
});

test('canTransition allows only the legal forward moves', () => {
  assert.equal(canTransition('DRAFT', 'OPEN'), true);
  assert.equal(canTransition('OPEN', 'CLOSED'), true);
  assert.equal(canTransition('DRAFT', 'CLOSED'), false);
  assert.equal(canTransition('OPEN', 'DRAFT'), false);
  assert.equal(canTransition('CLOSED', 'OPEN'), false);
  assert.equal(canTransition('CLOSED', 'DRAFT'), false);
  assert.equal(canTransition('UNKNOWN', 'OPEN'), false);
});

test('assertTransition passes a legal move', () => {
  assert.doesNotThrow(() => assertTransition('DRAFT', 'OPEN'));
  assert.doesNotThrow(() => assertTransition('OPEN', 'CLOSED'));
});

test('assertTransition throws 409 INVALID_TRANSITION on an illegal move', () => {
  assert.throws(
    () => assertTransition('DRAFT', 'CLOSED'),
    (error) => {
      assert.equal(error.statusCode, 409);
      assert.equal(error.code, 'INVALID_TRANSITION');
      return true;
    },
  );
  assert.throws(
    () => assertTransition('CLOSED', 'OPEN'),
    (error) => {
      assert.equal(error.code, 'INVALID_TRANSITION');
      return true;
    },
  );
});
