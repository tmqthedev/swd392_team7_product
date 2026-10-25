const { execFileSync } = require('child_process');

function runSsm(cmd) {
  const parameters = JSON.stringify({ commands: [cmd] });
  const sendOut = execFileSync(
    'aws',
    [
      'ssm',
      'send-command',
      '--instance-ids',
      'i-0797c55ad243db382',
      '--document-name',
      'AWS-RunShellScript',
      '--parameters',
      parameters,
      '--output',
      'json',
    ],
    { encoding: 'utf8' }
  );

  const commandId = JSON.parse(sendOut).Command.CommandId;

  // Poll for completion
  for (let i = 0; i < 30; i++) {
    execFileSync('powershell', ['-Command', 'Start-Sleep -Milliseconds 1500'], { stdio: 'ignore' });
    try {
      const getOut = execFileSync(
        'aws',
        [
          'ssm',
          'get-command-invocation',
          '--command-id',
          commandId,
          '--instance-id',
          'i-0797c55ad243db382',
          '--output',
          'json',
        ],
        { encoding: 'utf8' }
      );
      const res = JSON.parse(getOut);
      if (res.Status === 'Success') {
        return res.StandardOutputContent;
      }
      if (res.Status === 'Failed' || res.Status === 'Cancelled' || res.Status === 'TimedOut') {
        throw new Error(`SSM Command ${res.Status}: ${res.StandardErrorContent || res.StandardOutputContent}`);
      }
    } catch (e) {
      if (e.message.includes('SSM Command')) throw e;
    }
  }
  throw new Error('SSM command timed out waiting for execution');
}

const command = process.argv.slice(2).join(' ');
if (!command) {
  console.error('Usage: node scripts/aws-ssm.js <shell command>');
  process.exit(1);
}

try {
  const output = runSsm(command);
  console.log(output);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
