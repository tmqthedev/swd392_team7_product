#!/usr/bin/env node
/**
 * create-admin CLI: seed an ADMIN account.
 *
 * Usage:
 *   node src/cli/createAdmin.js --code A001 --email admin@aives.local \
 *     --full-name "Admin" --password "supersecret"
 *
 * Flags fall back to interactive readline prompts when omitted. Requires a real
 * database (DB_MOCK_MODE=false + DATABASE_URL). Refuses to create a second
 * ADMIN unless --force is given. --help prints usage and exits without touching
 * any database.
 */
const readline = require('readline');

const USAGE = `create-admin - create an ADMIN user

Usage:
  node src/cli/createAdmin.js [options]

Options:
  --code <code>          Login code for the admin (optional)
  --email <email>        Email address (required)
  --full-name <name>     Full name (optional)
  --password <password>  Password (min 8 chars; prompted if omitted)
  --force                Create even if an ADMIN already exists
  --help                 Show this help and exit (no database access)

Environment:
  DB_MOCK_MODE=false and DATABASE_URL must be set to reach a real database.
`;

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    switch (token) {
      case '--help':
      case '-h':
        args.help = true;
        break;
      case '--force':
        args.force = true;
        break;
      case '--code':
        args.code = argv[++i];
        break;
      case '--email':
        args.email = argv[++i];
        break;
      case '--full-name':
        args.fullName = argv[++i];
        break;
      case '--password':
        args.password = argv[++i];
        break;
      default:
        args._.push(token);
    }
  }
  return args;
}

function prompt(question, { silent = false } = {}) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    if (silent) {
      const onData = (char) => {
        const str = String(char);
        if (str === '\n' || str === '\r' || str === '\u0004') {
          process.stdout.write('\n');
        } else {
          process.stdout.write('*');
        }
      };
      process.stdin.on('data', onData);
      rl.question(question, (answer) => {
        process.stdin.removeListener('data', onData);
        rl.close();
        resolve(answer);
      });
    } else {
      rl.question(question, (answer) => {
        rl.close();
        resolve(answer);
      });
    }
  });
}

async function run(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);

  if (args.help) {
    process.stdout.write(USAGE);
    return 0;
  }

  // Lazy-require below --help so the help path never loads env/db modules.
  const env = require('../config/env');
  const { createDatabase } = require('../db/createDatabase');
  const { AppUserRepository } = require('../repositories/appUserRepository');
  const passwordHasher = require('../auth/passwordHasher');

  const email = args.email || (await prompt('Email: ')).trim();
  if (!email) {
    process.stderr.write('An email is required.\n');
    return 1;
  }
  const code = args.code != null ? args.code : (await prompt('Code (optional): ')).trim() || null;
  const fullName = args.fullName != null
    ? args.fullName
    : (await prompt('Full name (optional): ')).trim() || null;
  let password = args.password;
  if (!password) {
    password = await prompt('Password: ', { silent: true });
  }

  try {
    passwordHasher.assertStrong(password);
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    return 1;
  }

  const db = createDatabase(env);
  try {
    const repo = new AppUserRepository(db);
    const existing = await repo.countByRole('ADMIN');
    if (existing > 0 && !args.force) {
      process.stderr.write(
        `An ADMIN already exists (${existing}). Re-run with --force to create another.\n`,
      );
      return 1;
    }

    const passwordHash = await passwordHasher.hash(password);
    const created = await repo.create({
      code,
      email,
      fullName,
      passwordHash,
      role: 'ADMIN',
      status: 'ACTIVE',
    });
    process.stdout.write(`Created ADMIN user #${created.app_user_id} (${created.email}).\n`);
    return 0;
  } finally {
    if (typeof db.end === 'function') {
      await db.end();
    }
  }
}

if (require.main === module) {
  run()
    .then((code) => process.exit(code))
    .catch((err) => {
      process.stderr.write(`create-admin failed: ${err.message}\n`);
      process.exit(1);
    });
}

module.exports = { run, parseArgs };
