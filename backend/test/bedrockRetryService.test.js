const test = require('node:test');
const assert = require('node:assert/strict');
const { BedrockLlmAdapter } = require('../src/llm/bedrockLlmAdapter');

class FakeCommand {
  constructor(input) {
    this.input = input;
  }
}

function adapterWith(responses) {
  const adapter = new BedrockLlmAdapter({ env: { awsRegion: 'ap-southeast-1' } });
  let calls = 0;
  adapter._ConverseCommand = FakeCommand;
  adapter._client = {
    async send() {
      const next = responses[calls];
      calls += 1;
      if (next instanceof Error) throw next;
      return next;
    },
  };
  return { adapter, calls: () => calls };
}

function modelError() {
  const err = new Error('Model produced invalid sequence as part of ToolUse.');
  err.name = 'ModelErrorException';
  return err;
}

const toolUse = (name, input) => ({ output: { message: { content: [{ toolUse: { name, input } }] } } });

test('gradeQuestion retries a transient Nova ModelErrorException', async () => {
  const { adapter, calls } = adapterWith([modelError(), toolUse('emit_question_grade', { criteria_evaluations: [] })]);
  const out = await adapter.gradeQuestion({ language: 'VI', mainQuestion: { content: 'q' }, history: [], rubricCriteria: [] });
  assert.deepEqual(out, { criteria_evaluations: [] });
  assert.equal(calls(), 2);
});

test('decideFollowUp and generateQuestions retry a transient error too', async () => {
  const a = adapterWith([modelError(), toolUse('emit_follow_up_decision', { next_action: 'NEXT_MAIN_QUESTION' })]);
  assert.equal((await a.adapter.decideFollowUp({ language: 'VI' })).next_action, 'NEXT_MAIN_QUESTION');
  const b = adapterWith([modelError(), modelError(), toolUse('emit_questions', { questions: [{ content: 'x' }] })]);
  assert.equal((await b.adapter.generateQuestions({ language: 'vi', requestedCount: 1 })).length, 1);
  assert.equal(b.calls(), 3);
});

test('a persistent or non-retryable error still throws', async () => {
  const { adapter } = adapterWith([modelError(), modelError(), modelError()]);
  await assert.rejects(() => adapter.gradeQuestion({ language: 'EN' }), /invalid sequence/);
  const denied = new Error('not authorized');
  denied.name = 'AccessDeniedException';
  const b = adapterWith([denied]);
  await assert.rejects(() => b.adapter.decideFollowUp({ language: 'EN' }), /not authorized/);
  assert.equal(b.calls(), 1);
});
