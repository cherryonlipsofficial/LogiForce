/**
 * Create the first Platform Owner.   (run once, on a fresh install)
 *
 *   npm run platform:create-owner -- --email you@x.com --name "Your Name"
 *   npm run platform:create-owner -- --email you@x.com --name "Your Name" --link
 *
 * - Refuses if an active Platform Owner already exists. Further Owners (and
 *   all other platform users) are added from the platform console.
 * - First makes sure the platform roles (platform_owner, platform_support) and
 *   the default role templates exist (the same idempotent steps as
 *   `npm run platform:seed`). It creates no company and no business data.
 * - No password is ever in code, arguments or env. On a terminal you are asked
 *   for it twice, without echo. With --link, or when stdin is not a terminal,
 *   the account is created without a password and a one-time set-password link
 *   (valid 24 hours) is printed instead; open it to choose the password.
 * - Audited as actor 'system' ('platformUser.create' and 'platform.ownerBootstrap').
 *
 * Recovery, when the only Owner is locked out:
 *   npm run platform:create-owner -- --email owner@x.com --reset-password [--link]
 * sets a new password (or prints a set-password link) for that existing Owner
 * and signs out their sessions.
 *
 * Exits 0 on success, 1 on any error. Never prints a password.
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });

const readline = require('readline');
const { connectPlatformDb, closePlatformDb } = require('../db');
const platformModels = require('../models');
const platformUsers = require('../services/platformUser.service');
const { MIN_PASSWORD_LENGTH } = require('../models/PlatformUser');
const { PLATFORM_OWNER_ROLE_KEY } = require('../../config/platformPermissions');

const { SYSTEM_ACTOR } = platformUsers;
const USAGE = 'Usage: npm run platform:create-owner -- --email you@x.com --name "Your Name" [--link]\n'
  + '       npm run platform:create-owner -- --email owner@x.com --reset-password [--link]';

class UsageError extends Error {}

const parseArgs = (argv) => {
  const opts = { resetPassword: false, link: false };
  const valueFlags = { '--email': 'email', '--name': 'name' };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--reset-password') { opts.resetPassword = true; continue; }
    if (arg === '--link') { opts.link = true; continue; }
    if (arg === '--help' || arg === '-h') { opts.help = true; continue; }
    if (arg.toLowerCase().startsWith('--password')) {
      throw new UsageError('The password is never taken as an argument; you will be asked for it (or use --link).');
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

const askPassword = async () => {
  const first = await askHidden(`Password (at least ${MIN_PASSWORD_LENGTH} characters): `);
  const second = await askHidden('Repeat password: ');
  if (first !== second) throw new Error('The passwords do not match. Nothing was changed.');
  return first;
};

/** Ensure platform roles and role templates (idempotent; same as platform:seed). */
const defaultEnsureRoles = async (log) => {
  const { seedPlatform } = require('./seedPlatform');
  await seedPlatform({ log: (line) => log(line) });
};

/**
 * Create the first Owner. Everything the command line does except reading
 * argv and connecting, so it can be tested.
 *
 * @param {object} o
 * @param {string} o.email
 * @param {string} o.name
 * @param {boolean} o.useLink           print a set-password link instead of asking for a password
 * @param {() => Promise<string>} [o.readPassword]
 * @param {(log) => Promise<void>} [o.ensureRoles]
 * @param {(line: string) => void} [o.log]
 * @returns {Promise<{ user: object, link: { url: string, expiresAt: Date } | null }>}
 */
const bootstrapOwner = async ({
  email: rawEmail, name: rawName, useLink, readPassword = askPassword, ensureRoles = defaultEnsureRoles, log = console.log,
}) => {
  const email = platformUsers.normalizeEmail(rawEmail);
  const name = String(rawName || '').trim();
  if (!email) throw new UsageError('--email is required');
  if (!name) throw new UsageError('--name is required');

  const { PlatformUser, PlatformRole, PlatformAuditLog } = platformModels.getPlatformModels();
  const activeOwners = await PlatformUser.countDocuments({ roleKey: PLATFORM_OWNER_ROLE_KEY, isActive: true });
  if (activeOwners > 0) {
    throw new Error('An active Platform Owner already exists. Add more Owners from the platform console '
      + '(Platform users). Nothing was changed.');
  }
  if (await platformUsers.findPlatformUserByEmail(email)) {
    throw new Error(`A platform user ${email} already exists. Nothing was changed.`);
  }

  await ensureRoles(log);
  if (!(await PlatformRole.findOne({ key: PLATFORM_OWNER_ROLE_KEY }).lean())) {
    throw new Error(`The ${PLATFORM_OWNER_ROLE_KEY} role is missing after seeding. Nothing was created.`);
  }

  let user;
  let link = null;
  if (useLink) {
    user = await platformUsers.createInvitedPlatformUser({ email, name, roleKey: PLATFORM_OWNER_ROLE_KEY, actor: SYSTEM_ACTOR });
    const issued = await platformUsers.issuePlatformSetPasswordLink({ userId: user._id });
    link = { url: issued.url, expiresAt: issued.expiresAt };
  } else {
    const password = await readPassword();
    user = await platformUsers.createPlatformUser({ email, name, password, roleKey: PLATFORM_OWNER_ROLE_KEY, actor: SYSTEM_ACTOR });
  }

  await PlatformAuditLog.record({
    actor: SYSTEM_ACTOR,
    action: 'platform.ownerBootstrap',
    targetType: 'PlatformUser',
    targetId: user._id,
    targetKey: email,
    after: { roleKey: PLATFORM_OWNER_ROLE_KEY, method: useLink ? 'set-password link' : 'password prompt' },
  });
  return { user, link };
};

/** Recovery for an existing Owner: new password (prompt) or a set-password link. */
const recoverOwner = async ({ email: rawEmail, useLink, readPassword = askPassword }) => {
  const email = platformUsers.normalizeEmail(rawEmail);
  if (!email) throw new UsageError('--email is required');
  const user = await platformUsers.findPlatformUserByEmail(email);
  if (!user) throw new Error(`No platform user with email ${email}.`);
  if (user.roleKey !== PLATFORM_OWNER_ROLE_KEY) {
    throw new Error(`${email} is not a Platform Owner. Other users are managed from the platform console.`);
  }
  if (useLink) {
    const { PlatformUser, PlatformAuditLog } = platformModels.getPlatformModels();
    await PlatformUser.updateOne({ _id: user._id }, { $inc: { tokenVersion: 1 } }); // sign out every session
    const issued = await platformUsers.issuePlatformSetPasswordLink({ userId: user._id });
    await PlatformAuditLog.record({
      actor: SYSTEM_ACTOR,
      action: 'platformUser.set_password_link_issued',
      targetType: 'PlatformUser',
      targetId: user._id,
      targetKey: email,
      after: { expiresAt: issued.expiresAt },
    });
    return { link: { url: issued.url, expiresAt: issued.expiresAt } };
  }
  await platformUsers.resetPlatformUserPassword({ userId: user._id, password: await readPassword(), actor: SYSTEM_ACTOR });
  return { link: null };
};

const printLink = (link) => {
  console.log('\nOne-time set-password link (valid until ' + link.expiresAt.toISOString() + '):');
  console.log(`  ${link.url}`);
  console.log('Open it to choose the password. Do not share it; it is shown only this once.');
};

const main = async () => {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(USAGE);
    return;
  }
  const useLink = opts.link || !process.stdin.isTTY;
  if (!opts.link && useLink) console.log('stdin is not a terminal: printing a set-password link instead of asking.');

  await connectPlatformDb();

  if (opts.resetPassword) {
    const { link } = await recoverOwner({ email: opts.email, useLink });
    console.log(`Sessions of ${platformUsers.normalizeEmail(opts.email)} are signed out.`);
    if (link) printLink(link); else console.log('Password changed.');
    return;
  }

  const { user, link } = await bootstrapOwner({ email: opts.email, name: opts.name, useLink });
  console.log(`\nCreated Platform Owner ${user.email}.`);
  if (link) printLink(link);
  console.log('Sign in to the platform console, then add companies and platform users there.');
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

module.exports = { parseArgs, bootstrapOwner, recoverOwner };
