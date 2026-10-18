const test = require('node:test');
const assert = require('node:assert/strict');
const { buildMainRationale, buildFollowUpRationale } = require('../src/interview/rationaleBuilder');
const { UNVERIFIED_NOTE } = require('../src/interview/groundingValidator');

const NOW = new Date('2026-01-01T10:00:00.000Z');
const RUBRIC = {
  rubric_id: 5,
  version: 2,
  criteria: [
    { criterion_name: 'Accuracy', weight_percent: '60.00' },
    { criterion_name: 'Clarity', weight_percent: '40.00' },
  ],
};

const AI_QUESTION = {
  question_id: 101,
  source: 'AI',
  bloom_level: 'UNDERSTAND',
  key_points: ['kp one', 'kp two', 'kp three'],
  rationale: JSON.stringify({
    purpose: 'Assess handshake understanding.',
    synthesis: 'From chunk 11.',
    target: { keyPoints: ['kp one', 'kp two'], bloom: 'UNDERSTAND' },
  }),
};

const SOURCE_REFS = [
  {
    chunkId: 11,
    excerpt: 'establishes a connection using a three-way handshake',
    materialTitle: 'Networking 101',
    location: 'page 4',
    content: 'TCP establishes a connection using a three-way handshake (SYN, SYN-ACK, ACK).',
  },
  {
    chunkId: 12,
    excerpt: 'this text is not in the chunk',
    materialTitle: 'Networking 101',
    location: 'page 5',
    content: 'Flow control prevents the sender from overwhelming the receiver.',
  },
];

test('AI main rationale carries purpose/synthesis/bloom/targets/criteria and verified excerpts', () => {
  const r = buildMainRationale({
    question: AI_QUESTION, sourceRefs: SOURCE_REFS, rubric: RUBRIC, now: NOW,
  });
  assert.equal(r.kind, 'MAIN_AI');
  assert.equal(r.question_id, 101);
  assert.equal(r.purpose, 'Assess handshake understanding.');
  assert.equal(r.synthesis, 'From chunk 11.');
  assert.equal(r.bloom_level, 'UNDERSTAND');
  assert.deepEqual(r.target_key_points, ['kp one', 'kp two']);
  assert.deepEqual(r.target_criteria, ['Accuracy', 'Clarity']);
  assert.equal(r.snapshot_at, NOW.toISOString());
  assert.equal(r.grounding.length, 1);
  assert.equal(r.grounding[0].ref, 11);
  assert.equal(r.grounding[0].material_title, 'Networking 101');
  assert.equal(r.grounding[0].location, 'page 4');
  // The stored excerpt that is not in its chunk is flagged, not trusted.
  assert.equal(r.unverified_grounding.length, 1);
  assert.equal(r.unverified_grounding[0].ref, 12);
  assert.equal(r.unverified_grounding[0].note, UNVERIFIED_NOTE);
});

test('AI main rationale without a target falls back to question key points', () => {
  const r = buildMainRationale({
    question: { ...AI_QUESTION, rationale: { purpose: 'p' } }, sourceRefs: [], rubric: null, now: NOW,
  });
  assert.deepEqual(r.target_key_points, ['kp one', 'kp two', 'kp three']);
  assert.deepEqual(r.target_criteria, []);
});

for (const source of ['MANUAL', 'IMPORT']) {
  test(`${source} main rationale is lecturer-authored with rubric criteria`, () => {
    const r = buildMainRationale({
      question: {
        question_id: 7, source, bloom_level: 'APPLY', key_points: '["a","b"]', rationale: null,
      },
      sourceRefs: [],
      rubric: RUBRIC,
      now: NOW,
    });
    assert.equal(r.kind, 'MAIN_LECTURER');
    assert.equal(r.label, 'Câu do giảng viên soạn');
    assert.equal(r.authored_by, 'lecturer');
    assert.equal(r.purpose, null);
    assert.equal(r.bloom_level, 'APPLY');
    assert.deepEqual(r.target_key_points, ['a', 'b']);
    assert.deepEqual(r.rubric, {
      rubric_id: 5,
      version: 2,
      criteria: [{ name: 'Accuracy', weight_percent: 60 }, { name: 'Clarity', weight_percent: 40 }],
    });
    assert.deepEqual(r.grounding, []);
  });
}

test('MANUAL rationale keeps a lecturer purpose when present', () => {
  const r = buildMainRationale({
    question: { question_id: 8, source: 'MANUAL', rationale: { purpose: 'Check recall' } },
    rubric: null,
    now: NOW,
  });
  assert.equal(r.purpose, 'Check recall');
  assert.equal(r.rubric, null);
});

test('follow-up rationale keeps only verified grounding plus the unverified list', () => {
  const decision = {
    follow_up_reason: 'INCOMPLETE',
    covered_key_points: ['a'],
    missing_key_points: ['b'],
    rationale: {
      why: 'w', purpose: 'p', target_key_points: ['b'], target_criteria: ['Accuracy'], synthesis: 's',
      grounding: [{ type: 'STUDENT_QUOTE', text: 'invented' }],
    },
  };
  const groundingResult = {
    verified: [{
      type: 'STUDENT_QUOTE', ref: null, text: 'real quote', verified: true,
    }],
    unverified: [{
      type: 'STUDENT_QUOTE', ref: null, status: 'UNVERIFIED', note: UNVERIFIED_NOTE,
    }],
  };
  const r = buildFollowUpRationale({ decision, groundingResult, now: NOW });
  assert.equal(r.kind, 'FOLLOW_UP');
  assert.equal(r.follow_up_reason, 'INCOMPLETE');
  assert.equal(r.why, 'w');
  assert.deepEqual(r.grounding, groundingResult.verified);
  assert.deepEqual(r.unverified_grounding, groundingResult.unverified);
  assert.equal(JSON.stringify(r).includes('invented'), false);
  assert.deepEqual(r.missing_key_points, ['b']);
});
