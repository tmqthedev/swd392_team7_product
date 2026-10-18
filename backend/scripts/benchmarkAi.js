#!/usr/bin/env node
// AI Provider Latency and Quality Benchmark Script (Step 9)
// Measures real response times and token latencies for:
// 1. Bedrock Titan Text Embeddings V2
// 2. Bedrock Nova Pro Follow-up Decision (tool-use)
// 3. Bedrock Nova Pro Question Grading (tool-use)
// 4. TTS synthesis and S3 cache hit/miss speed

const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.resolve(__dirname, '..', '.env'), quiet: true });

const { BedrockEmbeddingAdapter } = require('../src/embedding/bedrockEmbeddingAdapter');
const { BedrockLlmAdapter } = require('../src/llm/bedrockLlmAdapter');
const { MockTtsAdapter } = require('../src/tts/mockTtsAdapter');
const { GoogleTtsAdapter } = require('../src/tts/googleTtsAdapter');

async function measure(name, fn) {
  const start = performance.now();
  try {
    const result = await fn();
    const duration = Math.round(performance.now() - start);
    return { name, ok: true, durationMs: duration, result };
  } catch (err) {
    const duration = Math.round(performance.now() - start);
    return { name, ok: false, durationMs: duration, error: err.message };
  }
}

async function runBenchmarks() {
  console.log('='.repeat(65));
  console.log('   AIVES - Step 9: Real AI Provider Latency Benchmark');
  console.log('='.repeat(65));
  console.log(`Node: ${process.version} | Timestamp: ${new Date().toISOString()}`);
  console.log(`AWS Region: ${process.env.AWS_REGION || 'ap-southeast-1'}\n`);

  const results = [];

  // --- 1. Bedrock Titan Text Embeddings V2 ---
  console.log('Testing Bedrock Titan Text Embeddings V2...');
  const embedAdapter = new BedrockEmbeddingAdapter({
    env: {
      awsRegion: process.env.AWS_REGION || 'ap-southeast-1',
      bedrockEmbedModelId: 'amazon.titan-embed-text-v2:0',
    },
  });

  const testText = 'Hệ quản trị cơ sở dữ liệu quan hệ bảo đảm tính chất ACID trong giao dịch.';
  const embedRes = await measure('Titan V2 Embedding (1024-dim)', async () => {
    return embedAdapter.embed(testText);
  });
  results.push(embedRes);

  if (embedRes.ok) {
    console.log(`  ✓ Success in ${embedRes.durationMs}ms | Dimensions: ${embedRes.result.length}`);
  } else {
    console.log(`  ✗ Failed in ${embedRes.durationMs}ms: ${embedRes.error}`);
  }

  // --- 2. Bedrock Nova Pro Follow-Up Decision (Tool-use) ---
  console.log('\nTesting Bedrock Nova Pro Converse API (Follow-up Decision)...');
  const llmAdapter = new BedrockLlmAdapter({
    env: {
      awsRegion: process.env.AWS_REGION || 'ap-southeast-1',
      bedrockModelId: 'apac.amazon.nova-pro-v1:0',
    },
  });

  const followUpInput = {
    language: 'vi',
    mainQuestion: {
      content: 'Trình bày sự khác biệt giữa Abstract Class và Interface trong Java.',
      referenceAnswer: 'Abstract class có thể chứa trạng thái và method có thân, hỗ trợ đơn kế thừa. Interface hỗ trợ đa kế thừa kiểu.',
      keyPoints: ['Đơn kế thừa vs Đa kế thừa', 'Có trạng thái (instance variables) vs Không có trạng thái', 'Default methods'],
    },
    history: [
      {
        turnType: 'MAIN_QUESTION',
        questionText: 'Trình bày sự khác biệt giữa Abstract Class và Interface trong Java.',
        answerText: 'Dạ, Java chỉ cho phép đơn kế thừa với abstract class nhưng một class có thể implement nhiều interface ạ.',
      },
    ],
    followUpCount: 0,
    maxFollowUps: 2,
  };

  const followUpRes = await measure('Nova Pro Follow-Up Tool (apac.amazon.nova-pro-v1:0)', async () => {
    return llmAdapter.decideFollowUp(followUpInput);
  });
  results.push(followUpRes);

  if (followUpRes.ok) {
    const action = followUpRes.result.action || followUpRes.result.next_action || (followUpRes.result.follow_up_question ? 'ASK' : 'MOVE_ON');
    console.log(`  ✓ Success in ${followUpRes.durationMs}ms | Action: ${action}`);
    if (followUpRes.result.follow_up_question) {
      console.log(`    Follow-up: "${followUpRes.result.follow_up_question}"`);
    }
  } else {
    console.log(`  ✗ Failed in ${followUpRes.durationMs}ms: ${followUpRes.error}`);
  }

  // --- 3. Bedrock Nova Pro Question Grading (Tool-use) ---
  console.log('\nTesting Bedrock Nova Pro Question Grading (Rubric Tool-use)...');
  const gradingInput = {
    language: 'vi',
    mainQuestion: followUpInput.mainQuestion,
    history: [
      ...followUpInput.history,
      {
        turnType: 'FOLLOW_UP',
        questionText: 'Thế còn về thuộc tính hoặc trạng thái giữa hai loại này thì sao em?',
        answerText: 'Dạ abstract class có thể có các biến instance non-static non-final, còn interface thì tất cả thuộc tính đều là public static final ạ.',
      },
    ],
    rubricCriteria: [
      {
        rubric_criterion_id: 1,
        name: 'Hiểu bản chất kế thừa',
        weight: 50,
        max_score: 10,
        performance_levels: [
          { performance_level_id: 11, label: 'Xuất sắc', min_score: 9, max_score: 10, description: 'Nắm vững đơn/đa kế thừa' },
          { performance_level_id: 12, label: 'Đạt', min_score: 7, max_score: 8.5, description: 'Nêu được sự khác biệt' },
        ],
      },
      {
        rubric_criterion_id: 2,
        name: 'Trạng thái và biến thành viên',
        weight: 50,
        max_score: 10,
        performance_levels: [
          { performance_level_id: 21, label: 'Đạt', min_score: 7, max_score: 10, description: 'Phân biệt đúng biến instance vs constant' },
        ],
      },
    ],
  };

  const gradingRes = await measure('Nova Pro Rubric Grading Tool', async () => {
    return llmAdapter.gradeQuestion(gradingInput);
  });
  results.push(gradingRes);

  if (gradingRes.ok) {
    console.log(`  ✓ Success in ${gradingRes.durationMs}ms | Confidence: ${gradingRes.result.confidence}`);
    console.log(`    Criteria evaluated: ${gradingRes.result.criteria_evaluations?.length || 0}`);
    console.log(`    Strengths: ${gradingRes.result.strengths}`);
  } else {
    console.log(`  ✗ Failed in ${gradingRes.durationMs}ms: ${gradingRes.error}`);
  }

  // --- 4. TTS Synthesis & S3 Caching ---
  console.log('\nTesting TTS Synthesis & S3 Cache...');
  const ttsAdapter = process.env.GOOGLE_TTS_API_KEY
    ? new GoogleTtsAdapter({ env: { audioBucket: 'local-audio-bucket' } })
    : new MockTtsAdapter();

  const tts1 = await measure('TTS Synthesis (Initial / Cache Miss)', async () => {
    return ttsAdapter.synthesize({ text: 'Chào mừng bạn đến với kỳ thi phỏng vấn tự động AIVES.', language: 'vi' });
  });
  results.push(tts1);
  console.log(`  ✓ Initial: ${tts1.durationMs}ms | Key: ${tts1.result?.audioKey}`);

  const tts2 = await measure('TTS Synthesis (S3 Cache Hit)', async () => {
    return ttsAdapter.synthesize({ text: 'Chào mừng bạn đến với kỳ thi phỏng vấn tự động AIVES.', language: 'vi' });
  });
  results.push(tts2);
  console.log(`  ✓ Cache Hit: ${tts2.durationMs}ms`);

  // --- Print Summary Table ---
  console.log('\n' + '='.repeat(65));
  console.log('                   BENCHMARK SUMMARY REPORT');
  console.log('='.repeat(65));
  console.log(
    'Component / Operation'.padEnd(42) +
    'Status'.padEnd(10) +
    'Latency'
  );
  console.log('-'.repeat(65));

  for (const r of results) {
    const status = r.ok ? 'PASS' : 'FAIL';
    console.log(
      r.name.padEnd(42) +
      status.padEnd(10) +
      `${r.durationMs} ms`
    );
  }
  console.log('='.repeat(65));

  return results;
}

if (require.main === module) {
  runBenchmarks()
    .then((results) => {
      const allPassed = results.every((r) => r.ok);
      process.exit(allPassed ? 0 : 1);
    })
    .catch((err) => {
      console.error('Benchmark execution error:', err);
      process.exit(1);
    });
}

module.exports = { runBenchmarks };
