/**
 * Create a platform user, or reset a platform user's password.
 *
 *   npm run platform:create-owner -- --email you@x.com --name "Your Name" [--role owner|support]
 *   npm run platform:create-owner -- --email you@x.com --reset-password
 *
 * The password is never a command-line argument (it would land in shell
 * history). On a terminal it is asked for twice, without echo. When stdin is
 * not a terminal it is read from PLATFORM_OWNER_PASSWORD. At least 12 characters.
 *
 * - New email: creates the user (role defaults to 'owner', status 'active') and
 *   audits 'platformUser.create' as actor 'system'.
 * - Existing email without --reset-password: prints "already exists", exits 1,
 *   changes nothing.
 * - --reset-password: sets the new password, increments tokenVersion (every
 *   existing platform session stops working) and audits
 *   'platformUser.password_reset'. Role and status are not changed.
 *
 * Exits 0 on success, 1 on any error. Never prints a password.
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });

const readline = require('readline');
const { connectPlatformDb, closePlatformDb } = require('../db');
const { getPlatformModels } = require('../models');
const {
  createPlatformUser,
  resetPlatformUserPassword,
  findPlatformUserByEmail,
  normalizeEmail,
  SYSTEM_ACTOR,
} = require('../services/platformUser.service');
const { MIN_PASSWORD_LENGTH } = require('../models/PlatformUser');

const ROLES = ['owner', 'support'];
const USAGE = 'Usage: npm run platform:create-owner -- --email you@x.com --name "Your Name" '
  + '[--role owner|support] [--reset-password]';

class UsageError extends Error {}

const parseArgs = (argv) => {
  const opts = { resetPassword: false };
  const valueFlags = { '--email': 'email', '--name': 'name', '--role': 'role' };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--reset-password') {
      opts.resetPassword = true;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      opts.help = true;
      continue;
    }
    if (arg.toLowerCase().startsWith('--password')) {
      throw new UsageError('The password is never taken as an argument; you will be asked for it.');
    }
    const [flag, inline] = arg.split(/=(.*)/s, 2);
    const key = valueFlags[flag];
    if (!key) throw new UsageError(`Unknown argument: ${arg}`);
    const value = inline !== undefined ? inline : argv[++i];
    if (value === undefined || value.startsWith('--')) throw new UsageError(`${flag} needs a value`);
    opts[key] = value;
  }
  return opts;
};

/** Read one line from the terminal without echoing it. */
const askHidden = (question) => new Promise((resolve, reject) => {
  const { stdin, stdout } = process;
  readline.emitKeypressEvents(stdin);
  const wasRaw = stdin.isRaw;
  stdin.setRawMode(true);
  stdin.resume();
  stdout.write(question);

  let value = '';
  const finish = (err) => {
    stdin.off('keypress', onKeypress);
    stdin.setRawMode(wasRaw);
    stdin.pause();
    stdout.write('\n');
    if (err) reject(err); else resolve(value);
  };
  function onKeypress(str, key = {}) {
    if (key.ctrl && (key.name === 'c' || key.name === 'd')) return finish(new Error('Cancelled'));
    if (key.name === 'return' || key.name === 'enter') return finish();
    if (key.name === 'backspace') {
      value = value.slice(0, -1);
      return undefined;
    }
    // Printable characters only; arrow keys and other escape sequences arrive with str undefined.
    if (typeof str === 'string' && !key.ctrl && !key.meta && !/[\u0000-\u001f\u007f]/.test(str)) value += str;
    return undefined;
  }
  stdin.on('keypress', onKeypress);
});

const readPassword = async () => {
  if (!process.stdin.isTTY) {
    const fromEnv = process.env.PLATFORM_OWNER_PASSWORD;
    if (!fromEnv) {
      throw new Error('stdin is not a terminal, so the password is read from PLATFORM_OWNER_PASSWORD, which is not set.');
    }
    return fromEnv;
  }
  const first = await askHidden(`Password (at least ${MIN_PASSWORD_LENGTH} characters): `);
  const second = await askHidden('Repeat password: ');
  if (first !== second) throw new Error('The passwords do not match. Nothing was changed.');
  return first;
};

const main = async () => {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(USAGE);
    return;
  }

  const email = normalizeEmail(opts.email);
  if (!email) throw new UsageError('--email is required');
  if (opts.role !== undefined && !ROLES.includes(opts.role)) {
    throw new UsageError(`--role must be one of: ${ROLES.join(', ')}`);
  }

  await connectPlatformDb();
  const { PlatformUser, PlatformAuditLog, PlatformLoginChallenge } = getPlatformModels();
  // Make sure the unique email index exists before relying on it.
  await Promise.all([PlatformUser.init(), PlatformAuditLog.init(), PlatformLoginChallenge.init()]);

  const existing = await findPlatformUserByEmail(email);

  if (opts.resetPassword) {
    if (!existing) {
      throw new Error(`No platform user with email ${email}. Run without --reset-password to create one.`);
    }
    if (opts.role !== undefined || opts.name !== undefined) {
      console.log('Note: --role and --name are ignored with --reset-password; role and name stay as they are.');
    }
    const password = await readPassword();
    await resetPlatformUserPassword({ userId: existing._id, password, actor: SYSTEM_ACTOR });
    console.log(`Password reset for ${existing.email}. Every existing platform session for this user is signed out.`);
    return;
  }

  if (existing) {
    throw new Error(`Platform user ${email} already exists. Nothing was changed. `
      + 'Use --reset-password to set a new password.');
  }

  const name = (opts.name || '').trim();
  if (!name) throw new UsageError('--name is required to create a user');

  const role = opts.role || 'owner';
  const password = await readPassword();
  const user = await createPlatformUser({ email, name, password, role, status: 'active', actor: SYSTEM_ACTOR });
  console.log(`Created platform ${user.role} ${user.email}.`);
};

if (require.main === module) {
  (async () => {
    let code = 0;
    try {
      await main();
    } catch (err) {
      code = 1;
      console.error(err instanceof UsageError ? `${err.message}\n${USAGE}` : `Error: ${err.message}`);
    }
    await closePlatformDb().catch(() => {});
    process.exit(code);
  })();
}

module.exports = { parseArgs };
