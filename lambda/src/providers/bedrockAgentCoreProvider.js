class BedrockAgentCoreProvider {
  async evaluateVivaAnswer(_payload) {
    throw new Error('evaluateVivaAnswer not implemented');
  }
}

class MockBedrockAgentCoreProvider extends BedrockAgentCoreProvider {
  async evaluateVivaAnswer(payload) {
    const transcriptLength = (payload.transcript || '').length;
    return {
      provider: 'mock-agentcore-adapter',
      score: Math.min(10, Number((transcriptLength / 50).toFixed(2)) + 5),
      feedback: 'Mock AgentCore evaluation. Replace with actual Bedrock AgentCore runtime call.',
      rubric: {
        clarity: 8,
        correctness: 7,
        confidence: 8,
      },
    };
  }
}

function createBedrockAgentCoreProvider() {
  return new MockBedrockAgentCoreProvider();
}

module.exports = {
  BedrockAgentCoreProvider,
  MockBedrockAgentCoreProvider,
  createBedrockAgentCoreProvider,
};
