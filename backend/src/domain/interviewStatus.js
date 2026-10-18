// Pure interview + Q&A-turn state machine for the Step-6 interview engine. No
// I/O, no dependencies. Mirrors domain/examSessionStatus.js.

const INTERVIEW_STATUSES = ['NOT_STARTED', 'IN_PROGRESS', 'PAUSED', 'COMPLETED', 'TERMINATED'];

// Allowed moves per current interview status. COMPLETED/TERMINATED are terminal.
// PAUSED (A5 reconnect) is handled in Step 10; the edges exist so the table is
// complete today.
const INTERVIEW_TRANSITIONS = {
  NOT_STARTED: ['IN_PROGRESS'],
  IN_PROGRESS: ['PAUSED', 'COMPLETED', 'TERMINATED'],
  PAUSED: ['IN_PROGRESS', 'COMPLETED', 'TERMINATED'],
  COMPLETED: [],
  TERMINATED: [],
};

// Interview statuses that still accept engine calls.
const ACTIVE_INTERVIEW_STATUSES = ['IN_PROGRESS', 'PAUSED'];

// qa_turn.status values (CHECK in migration 016).
//   ASKED      question created and (optionally) audio ready; not yet played
//   ANSWERING  question played; the answer window is open
//   PROCESSING answer claimed by submitAnswer (STT / LLM in flight)
//   ANSWERED   answer persisted
//   UNANSWERED interview ended before an answer arrived
//   FAILED     reserved for Step 10 (A1-A3 retries exhausted)
const TURN_STATUSES = ['ASKED', 'ANSWERING', 'PROCESSING', 'ANSWERED', 'UNANSWERED', 'FAILED'];
const ACTIVE_TURN_STATUSES = ['ASKED', 'ANSWERING'];

const END_REASONS = {
  DEADLINE_REACHED: 'DEADLINE_REACHED',
  QUESTIONS_EXHAUSTED: 'QUESTIONS_EXHAUSTED',
};

function canTransition(from, to) {
  const allowed = INTERVIEW_TRANSITIONS[from];
  if (!allowed) return false;
  return allowed.includes(to);
}

function assertTransition(from, to) {
  if (!canTransition(from, to)) {
    const err = new Error(`Cannot transition interview from ${from} to ${to}.`);
    err.statusCode = 409;
    err.code = 'INVALID_TRANSITION';
    throw err;
  }
}

module.exports = {
  INTERVIEW_STATUSES,
  INTERVIEW_TRANSITIONS,
  ACTIVE_INTERVIEW_STATUSES,
  TURN_STATUSES,
  ACTIVE_TURN_STATUSES,
  END_REASONS,
  canTransition,
  assertTransition,
};
