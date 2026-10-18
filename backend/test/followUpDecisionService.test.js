const test = require('node:test');
const assert = require('node:assert/strict');
const { parseFollowUpDecision, MAX_FOLLOW_UP_WORDS } = require('../src/interview/followUpDecision');

const CTX = {
  referenceAnswer: 'TCP uses a three-way handshake to establish a reliable connection',
  keyPoints: ['three-way handshake SYN SYN-ACK ACK', 'reliable ordered delivery'],
};

function validAsk(over = {}) {
  return {
    next_action: 'ASK_FOLLOW_UP',
    follow_up_reason: 'INCOMPLETE',
    covered_key_points: ['reliable ordered delivery'],
    missing_key_points: ['three-way handshake SYN SYN-ACK ACK'],
    follow_up_question: 'How does a connection get established before data flows?',
    rationale: {
      why: 'Connection setup was not explained.',
      purpose: 'Probe the missing setup step.',
      target_key_points: ['three-way handshake SYN SYN-ACK ACK'],
      target_criteria: ['Accuracy'],
      grounding: [{ type: 'STUDENT_QUOTE', ref: null, text: 'it is reliable' }],
      synthesis: 'Student covered delivery but not setup.',
    },
    ...over,
  };
}

function rejects(raw, ctx = CTX) {
  const result = parseFollowUpDecision(raw, ctx);
  assert.equal(result.ok, false);
  assert.equal(result.errorCode, 'LLM_INVALID_OUTPUT');
}

test('a valid ASK_FOLLOW_UP object is accepted and normalized', () => {
  const result = parseFollowUpDecision(validAsk({ follow_up_question: '  How is it set up?  ' }), CTX);
  assert.equal(result.ok, true);
  assert.equal(result.value.next_action, 'ASK_FOLLOW_UP');
  assert.equal(result.value.follow_up_question, 'How is it set up?');
  assert.equal(result.value.rationale.grounding.length, 1);
});

test('a valid JSON string is accepted', () => {
  const result = parseFollowUpDecision(JSON.stringify(validAsk()), CTX);
  assert.equal(result.ok, true);
});

test('malformed JSON -> LLM_INVALID_OUTPUT', () => {
  rejects('{"next_action": "ASK_FOLLOW_UP", ');
  rejects('not json at all');
  rejects(null);
  rejects([]);
});

test('a bad next_action is rejected', () => {
  rejects(validAsk({ next_action: 'SKIP' }));
});

test('ASK with a null or empty question is rejected', () => {
  rejects(validAsk({ follow_up_question: null }));
  rejects(validAsk({ follow_up_question: '   ' }));
});

test('ASK with a null or unknown reason is rejected', () => {
  rejects(validAsk({ follow_up_reason: null }));
  rejects(validAsk({ follow_up_reason: 'BORED' }));
});

test('non-array key points are rejected', () => {
  rejects(validAsk({ covered_key_points: 'x' }));
  rejects(validAsk({ missing_key_points: [1, 2] }));
});

test('ASK with a missing or malformed rationale is rejected', () => {
  rejects(validAsk({ rationale: undefined }));
  rejects(validAsk({ rationale: { ...validAsk().rationale, grounding: 'none' } }));
  rejects(validAsk({ rationale: { ...validAsk().rationale, why: 3 } }));
});

test(`a ${MAX_FOLLOW_UP_WORDS + 1}-word question is rejected`, () => {
  const long = `${Array.from({ length: MAX_FOLLOW_UP_WORDS + 1 }, () => 'word').join(' ')}?`;
  rejects(validAsk({ follow_up_question: long }));
  const ok = `${Array.from({ length: MAX_FOLLOW_UP_WORDS }, () => 'word').join(' ')}?`;
  assert.equal(parseFollowUpDecision(validAsk({ follow_up_question: ok }), CTX).ok, true);
});

test('two question marks (two questions) are rejected', () => {
  rejects(validAsk({ follow_up_question: 'What is SYN? And what is ACK?' }));
});

test('a question that leaks the reference answer is rejected', () => {
  rejects(validAsk({
    follow_up_question: 'Did you know TCP uses a three-way handshake to establish a reliable connection?',
  }));
});

test('a question that names a missing key point is rejected', () => {
  rejects(validAsk({ follow_up_question: 'Can you describe the Three-Way Handshake SYN, SYN-ACK, ACK?' }));
});

test('NEXT_MAIN_QUESTION with a null question and reason is accepted', () => {
  const result = parseFollowUpDecision({
    next_action: 'NEXT_MAIN_QUESTION',
    follow_up_reason: null,
    covered_key_points: ['a'],
    missing_key_points: [],
    follow_up_question: null,
  }, CTX);
  assert.equal(result.ok, true);
  assert.equal(result.value.follow_up_question, null);
  assert.equal(result.value.rationale, null);
});
