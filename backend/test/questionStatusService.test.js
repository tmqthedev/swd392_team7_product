const test = require('node:test');
const assert = require('node:assert/strict');
const {
  STATUSES,
  TRANSITIONS,
  canTransition,
  assertTransition,
  isExamEligible,
} = require('../src/domain/questionStatus');

test('STATUSES lists the five Step-3 statuses', () => {
  assert.deepEqual(STATUSES, ['DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'ARCHIVED']);
});

test('every legal transition in the map passes canTransition', () => {
  for (const [from, targets] of Object.entries(TRANSITIONS)) {
    for (const to of targets) {
      assert.equal(canTransition(from, to), true, `${from} -> ${to} should be legal`);
    }
  }
});

test('representative illegal transitions are rejected', () => {
  // ARCHIVED is terminal.
  assert.equal(canTransition('ARCHIVED', 'APPROVED'), false);
  assert.equal(canTransition('ARCHIVED', 'DRAFT'), false);
  // DRAFT cannot jump straight to REJECTED (must be reviewed first).
  assert.equal(canTransition('DRAFT', 'REJECTED'), false);
  // APPROVED cannot go back to DRAFT or REJECTED directly.
  assert.equal(canTransition('APPROVED', 'DRAFT'), false);
  assert.equal(canTransition('APPROVED', 'REJECTED'), false);
  // Unknown statuses never transition.
  assert.equal(canTransition('UNKNOWN', 'DRAFT'), false);
});

test('assertTransition throws 409 INVALID_TRANSITION on an illegal move', () => {
  assert.throws(
    () => assertTransition('ARCHIVED', 'APPROVED'),
    (error) => {
      assert.equal(error.statusCode, 409);
      assert.equal(error.code, 'INVALID_TRANSITION');
      return true;
    },
  );
});

test('assertTransition does not throw on a legal move', () => {
  assert.doesNotThrow(() => assertTransition('DRAFT', 'PENDING_REVIEW'));
  assert.doesNotThrow(() => assertTransition('PENDING_REVIEW', 'APPROVED'));
});

test('isExamEligible is true only for APPROVED', () => {
  assert.equal(isExamEligible('APPROVED'), true);
  for (const status of ['DRAFT', 'PENDING_REVIEW', 'REJECTED', 'ARCHIVED']) {
    assert.equal(isExamEligible(status), false);
  }
});
