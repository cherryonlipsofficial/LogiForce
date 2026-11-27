/**
 * Register a company database that already exists as a platform Tenant.
 *
 *   npm run platform:register-tenant -- --key <key> --db <dbName> --name "<name>"
 *
 * For companies that were set up before the platform console existed. Every
 * value comes from the command line; nothing about any company is in code.
 *
 * - The database must already exist on MONGODB_BASE_URI's cluster and hold
 *   data (an empty or missing database is refused: probably a typo; new
 *   companies are created in the console instead).
 * - The key and the database must not be registered yet.
 * - The record is created 'active' with every module on and every current
 *   role template allowed. Change that afterwards in the console.
 * - The company database is only read (its collection list); never written.
 * - Audited as 'tenant.register', actor 'system'.
 *
 * Then link the company's roles to the templates:
 *   npm run migrate:platform -- --source <key>            (dry run, then --apply)
 *   npm run platform:sync-roles -- --tenant <key>         (dry run, then --apply)
 *
 * Never prints a URI.
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });

const { connectPlatformDb, closePlatformDb } = require('../db');
const platformModels = require('../models');
const { tenantKeyProblem } = require('../models/Tenant');
const { MODULES } = require('../../config/permissions');
const { RETIRED_TEMPLATE_KEYS } = require('../../config/defaultRoles');
const { buildDbUri, redactUris, invalidateTenantCache } = require('../../config/tenants');

const SYSTEM_ACTOR = Object.freeze({ userId: null, email: 'system' });
const DB_NAME_PATTERN = /^[a-z][a-z0-9_]{2,60}$/; // models/Tenant.js
const USAGE = 'Usage: npm run platform:register-tenant -- --key <key> --db <dbName> --name "<name>"';

class UsageError extends Error {}

const parseArgs = (argv) => {
  const opts = {};
  const flags = { '--key': 'key', '--db': 'db', '--name': 'name' };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') { opts.help = true; continue; }
    const [flag, inline] = arg.split(/=(.*)/s, 2);
    const field = flags[flag];
    if (!field) throw new UsageError(`Unknown argument: ${arg}`);
    const value = inline !== undefined ? inline : argv[++i];
    if (value === undefined || value.startsWith('--')) throw new UsageError(`${flag} needs a value`);
    opts[field] = value;
  }
  return opts;
};

/**
 * Read-only look at a database on the shared cluster.
 * @returns {Promise<{ collections: string[] }>}
 */
const inspectDatabase = async (dbName) => {
  const mongoose = require('mongoose');
  const uri = buildDbUri(dbName);
  if (!uri) throw new Error('MONGODB_BASE_URI is not set (or not a MongoDB URI)');
  const conn = await mongoose.createConnection(uri, {
    autoIndex: false,
    autoCreate: false,
    serverSelectionTimeoutMS: 5000,
    ...(uri.startsWith('mongodb+srv://') ? { tls: true } : {}),
  }).asPromise();
  try {
    const list = await conn.db.listCollections({}, { nameOnly: true }).toArray();
    return { collections: list.map((c) => c.name).filter((n) => !n.startsWith('system.')).sort() };
  } finally {
    await conn.close().catch(() => {});
  }
};

/**
 * @param {{ key: string, db: string, name: string, inspect?: (dbName) => Promise<{collections: string[]}> }} o
 * @returns {Promise<object>} the new Tenant record (lean)
 */
const registerExistingTenant = async ({ key: rawKey, db: rawDb, name: rawName, inspect = inspectDatabase }) => {
  const key = String(rawKey || '').trim().toLowerCase();
  const dbName = String(rawDb || '').trim();
  const name = String(rawName || '').trim();

  const problems = [];
  const keyProblem = tenantKeyProblem(key);
  if (keyProblem) problems.push(`--key: ${keyProblem}`);
  if (!DB_NAME_PATTERN.test(dbName)) {
    problems.push('--db: 3–61 characters: a lowercase letter, then lowercase letters, digits or underscores');
  }
  if (!name) problems.push('--name is required');
  if (problems.length) throw new UsageError(problems.join('\n'));

  const { Tenant, RoleTemplate, PlatformAuditLog } = platformModels.getPlatformModels();
  const byKey = await Tenant.findOne({ key }).select('key').lean();
  if (byKey) throw new Error(`A company with key "${key}" is already registered. Nothing was changed.`);
  const byDb = await Tenant.findOne({ dbName }).select('key').lean();
  if (byDb) throw new Error(`Database "${dbName}" is already registered to company "${byDb.key}". Nothing was changed.`);

  let collections;
  try {
    ({ collections } = await inspect(dbName));
  } catch (err) {
    throw new Error(`Could not read database "${dbName}": ${redactUris(err.message)}. Nothing was changed.`);
  }
  if (!collections.length) {
    throw new Error(`Database "${dbName}" does not exist or is empty on the MONGODB_BASE_URI cluster. `
      + 'Check the name; create new companies in the platform console instead. Nothing was changed.');
  }

  const roleTemplateKeys = (await RoleTemplate.distinct('key'))
    .filter((k) => !RETIRED_TEMPLATE_KEYS.includes(k))
    .sort();
  if (!roleTemplateKeys.length) {
    throw new Error('There are no role templates yet. Run npm run platform:seed (or platform:create-owner) first.');
  }

  const doc = await Tenant.create({
    key,
    name,
    dbName,
    status: 'active',
    enabledModules: [...MODULES],
    roleTemplateKeys,
    limits: { maxUsers: null },
    allowSelfSignup: false,
    createdBy: null,
    provisioning: { completedAt: new Date() },
  });
  const record = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  invalidateTenantCache(key);

  await PlatformAuditLog.record({
    actor: SYSTEM_ACTOR,
    action: 'tenant.register',
    targetType: 'Tenant',
    targetId: record._id,
    targetKey: key,
    before: null,
    after: { key, name, dbName, status: 'active', enabledModules: record.enabledModules, roleTemplateKeys, collections: collections.length },
  });
  return { tenant: record, collections };
};

if (require.main === module) {
  (async () => {
    let code = 0;
    try {
      const opts = parseArgs(process.argv.slice(2));
      if (opts.help) {
        console.log(USAGE);
      } else {
        await connectPlatformDb();
        const { tenant, collections } = await registerExistingTenant(opts);
        console.log(`Registered company "${tenant.key}" (${tenant.name}), database ${tenant.dbName} `
          + `(${collections.length} collection(s)), active, all modules on.`);
        console.log('Next, link its roles to the role templates:');
        console.log(`  npm run migrate:platform -- --source ${tenant.key}`);
        console.log(`  npm run platform:sync-roles -- --tenant ${tenant.key}`);
        console.log('(both are dry runs; add --apply once the output looks right)');
      }
    } catch (err) {
      code = 1;
      console.error(err instanceof UsageError ? `${err.message}\n${USAGE}` : `Error: ${redactUris(err.message)}`);
    }
    await closePlatformDb().catch(() => {});
    process.exit(code);
  })();
}

module.exports = { parseArgs, registerExistingTenant };
