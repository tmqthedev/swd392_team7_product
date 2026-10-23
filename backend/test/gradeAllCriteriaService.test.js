const test = require('node:test');
const assert = require('node:assert/strict');
const { BedrockLlmAdapter } = require('../src/llm/bedrockLlmAdapter');
const { buildGradingUserPrompt, missingCriterionIds } = require('../src/llm/gradingPrompt');

const rubricCriteria = [
  { rubric_criterion_id: 7, name: 'Knowledge', weight: 50, max_score: 10, performance_levels: [] },
  { rubric_criterion_id: 8, name: 'Examples', weight: 30, max_score: 10, performance_levels: [] },
  { rubric_criterion_id: 9, name: 'Clarity', weight: 20, max_score: 10, performance_levels: [] },
];

const grade = (ids) => ({
  output: { message: { content: [{ toolUse: { name: 'emit_question_grade', input: { criteria_evaluations: ids.map((id) => ({ criterion_id: id, ai_score: 5 })) } } }] } },
});

function adapterWith(responses) {
  const adapter = new BedrockLlmAdapter({ env: { awsRegion: 'ap-southeast-1' } });
  let calls = 0;
  adapter._ConverseCommand = class { constructor(input) { this.input = input; } };
  adapter._client = { async send() { const r = responses[calls]; calls += 1; return r; } };
  return { adapter, calls: () => calls };
}

test('the grading prompt asks for one entry per criterion ID', () => {
  const prompt = buildGradingUserPrompt({ rubricCriteria });
  assert.match(prompt, /fill criteria.criterion_<ID> for every criterion ID 7, 8, 9/);
  assert.deepEqual(missingCriterionIds({ criteria_evaluations: [{ criterion_id: '7' }] }, rubricCriteria), [8, 9]);
});

test('gradeQuestion retries until every criterion is graded', async () => {
  const { adapter, calls } = adapterWith([grade([7]), grade([7, 8, 9])]);
  const out = await adapter.gradeQuestion({ language: 'VI', rubricCriteria });
  assert.equal(out.criteria_evaluations.length, 3);
  assert.equal(calls(), 2);
});

test('gradeQuestion asks only for ungraded criteria and merges the answers', async () => {
  const sent = [];
  const { adapter } = adapterWith([grade([7]), grade([8]), grade([9])]);
  const send = adapter._client.send;
  adapter._client.send = async (cmd) => { sent.push(Object.keys(cmd.input.toolConfig.tools[0].toolSpec.inputSchema.json.properties.criteria.properties)); return send(cmd); };
  const out = await adapter.gradeQuestion({ language: 'EN', rubricCriteria });
  assert.deepEqual(out.criteria_evaluations.map((c) => c.criterion_id), [7, 8, 9]);
  assert.deepEqual(sent, [['criterion_7', 'criterion_8', 'criterion_9'], ['criterion_8', 'criterion_9'], ['criterion_9']]);
});

test('gradeQuestion returns a partial grade when criteria stay ungraded', async () => {
  const { adapter } = adapterWith([grade([7]), grade([7]), grade([7])]);
  const out = await adapter.gradeQuestion({ language: 'EN', rubricCriteria });
  assert.deepEqual(out.criteria_evaluations.map((c) => c.criterion_id), [7]);
});
