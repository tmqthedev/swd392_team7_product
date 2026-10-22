const test = require('node:test');
const assert = require('node:assert/strict');
const {
  STATUSES,
  TRANSITIONS,
  canTransition,
  assertTransition,
} = require('../src/domain/examSessionStatus');

test('STATUSES and TRANSITIONS describe DRAFT->SCHEDULED->OPEN->CLOSED (+ withdraw)', () => {
  assert.deepEqual(STATUSES, ['DRAFT', 'SCHEDULED', 'OPEN', 'CLOSED']);
  assert.deepEqual(TRANSITIONS, {
    DRAFT: ['SCHEDULED'],
    SCHEDULED: ['DRAFT', 'OPEN'],
    OPEN: ['CLOSED'],
    CLOSED: [],
  });
});

test('canTransition allows only the legal moves', () => {
  assert.equal(canTransition('DRAFT', 'SCHEDULED'), true);
  assert.equal(canTransition('SCHEDULED', 'DRAFT'), true);
  assert.equal(canTransition('SCHEDULED', 'OPEN'), true);
  assert.equal(canTransition('OPEN', 'CLOSED'), true);
  // The lecturer can no longer open a DRAFT directly.
  assert.equal(canTransition('DRAFT', 'OPEN'), false);
  assert.equal(canTransition('DRAFT', 'CLOSED'), false);
  assert.equal(canTransition('SCHEDULED', 'CLOSED'), false);
  assert.equal(canTransition('OPEN', 'DRAFT'), false);
  assert.equal(canTransition('OPEN', 'SCHEDULED'), false);
  assert.equal(canTransition('CLOSED', 'OPEN'), false);
  assert.equal(canTransition('CLOSED', 'DRAFT'), false);
  assert.equal(canTransition('UNKNOWN', 'OPEN'), false);
});

test('assertTransition passes a legal move', () => {
  assert.doesNotThrow(() => assertTransition('DRAFT', 'SCHEDULED'));
  assert.doesNotThrow(() => assertTransition('SCHEDULED', 'OPEN'));
  assert.doesNotThrow(() => assertTransition('OPEN', 'CLOSED'));
});

test('assertTransition throws 409 INVALID_TRANSITION on an illegal move', () => {
  assert.throws(
    () => assertTransition('DRAFT', 'OPEN'),
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
