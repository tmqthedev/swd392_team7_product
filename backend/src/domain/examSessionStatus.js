// Pure exam-session state machine for the exam lifecycle. No I/O, no
// dependencies: the service layer uses canTransition/assertTransition to guard
// DRAFT -> SCHEDULED -> OPEN -> CLOSED moves. Mirrors domain/questionStatus.js.
//   DRAFT -> SCHEDULED   lecturer submits the schedule (opens_at/closes_at)
//   SCHEDULED -> DRAFT   lecturer withdraws it to edit again
//   SCHEDULED -> OPEN    ADMIN starts the exam (warm-up + audio pre-generation)
//   OPEN -> CLOSED       ADMIN or the scoped LECTURER closes it

const STATUSES = ['DRAFT', 'SCHEDULED', 'OPEN', 'CLOSED'];

// Allowed moves per current status. CLOSED is terminal.
const TRANSITIONS = {
  DRAFT: ['SCHEDULED'],
  SCHEDULED: ['DRAFT', 'OPEN'],
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
