const { spawnSync } = require('node:child_process');
const { readdirSync } = require('node:fs');
const args = process.argv[2] === 'unit'
  ? ['--test', ...readdirSync('test').filter(file => file.endsWith('Service.test.js')).map(file => `test/${file}`)]
  : [require.resolve('jest/bin/jest'), '--runInBand', ...process.argv.slice(3)];
const result = spawnSync(process.execPath, args, {
  stdio: 'inherit', env: { ...process.env, AWS_MOCK_MODE: 'true',
    LLM_PROVIDER: 'mock', EMBEDDING_PROVIDER: 'mock', STT_PROVIDER: 'mock', TTS_PROVIDER: 'mock' },
});
if (result.error) console.error(result.error);
process.exit(result.status ?? 1);
