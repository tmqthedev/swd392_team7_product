// Pure question-status state machine for the Step-3 question lifecycle. No I/O,
// no dependencies: the service layer uses canTransition/assertTransition to
// guard lifecycle moves and isExamEligible to gate exam assignment.

const STATUSES = ['DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'ARCHIVED'];

// Allowed forward moves per current status. ARCHIVED is terminal.
const TRANSITIONS = {
  DRAFT: ['PENDING_REVIEW', 'APPROVED', 'ARCHIVED'],
  PENDING_REVIEW: ['APPROVED', 'REJECTED', 'DRAFT'],
  APPROVED: ['ARCHIVED', 'PENDING_REVIEW'],
  REJECTED: ['DRAFT', 'ARCHIVED'],
  ARCHIVED: [],
};

function canTransition(from, to) {
  const allowed = TRANSITIONS[from];
  if (!allowed) return false;
  return allowed.includes(to);
}

function assertTransition(from, to) {
  if (!canTransition(from, to)) {
    const err = new Error(`Cannot transition question from ${from} to ${to}.`);
    err.statusCode = 409;
    err.code = 'INVALID_TRANSITION';
    throw err;
  }
}

function isExamEligible(status) {
  return status === 'APPROVED';
}

module.exports = {
  STATUSES,
  TRANSITIONS,
  canTransition,
  assertTransition,
  isExamEligible,
};
