// Pure exam-session state machine for the Step-5 exam lifecycle. No I/O, no
// dependencies: the service layer uses canTransition/assertTransition to guard
// DRAFT -> OPEN -> CLOSED moves. Mirrors domain/questionStatus.js.

const STATUSES = ['DRAFT', 'OPEN', 'CLOSED'];

// Allowed forward moves per current status. CLOSED is terminal.
const TRANSITIONS = {
  DRAFT: ['OPEN'],
  OPEN: ['CLOSED'],
  CLOSED: [],
};

function canTransition(from, to) {
  const allowed = TRANSITIONS[from];
  if (!allowed) return false;
  return allowed.includes(to);
}

function assertTransition(from, to) {
  if (!canTransition(from, to)) {
    const err = new Error(`Cannot transition exam session from ${from} to ${to}.`);
    err.statusCode = 409;
    err.code = 'INVALID_TRANSITION';
    throw err;
  }
}

module.exports = {
  STATUSES,
  TRANSITIONS,
  canTransition,
  assertTransition,
};
