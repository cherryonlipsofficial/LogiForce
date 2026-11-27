/**
 * Remove company records that an old `npm run platform:seed` created.
 *
 *   npm run platform:remove-seeded-tenants                      (dry run: lists them)
 *   npm run platform:remove-seeded-tenants -- --apply           (removes the unused ones)
 *   npm run platform:remove-seeded-tenants -- --apply --key <key> --key <key>
 *
 * Older versions of platform:seed registered a hardcoded list of four
 * companies. Companies are now created only by a product owner in the platform
 * console, and the seed creates none. This script removes the records the old
 * seed left behind. No company key is written here: the records are found
 * through the audit log.
 *
 * A record is a candidate only if the platform audit log shows the seed made
 * it: a 'tenant.create' entry by actor 'system'. Companies created in the
 * console (actor = a platform user) and companies registered with
 * platform:register-tenant ('tenant.register') are never touched.
 *
 * - Dry run by default. Nothing is written without --apply.
 * - With --apply and no --key, only candidates whose company database is
 *   missing or empty are removed. A candidate whose database holds data is
 *   kept and reported. Name it with --key to remove its record anyway.
 * - With --key (repeatable), only those candidates are considered.
 * - Only the platform record is removed. The company database itself is only
 *   read (its collection list) and never written or dropped.
 * - Each removal is audited as 'tenant.delete', actor 'system', with the
 *   removed record as `before`.
 *
 * A running server caches company records for up to TENANT_CACHE_TTL_MS
 * (60 s by default), so a removed company can still resolve briefly.
 *
 * Never prints a URI.
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });

const { connectPlatformDb, closePlatformDb } = require('../db');
const platformModels = require('../models');
const { buildDbUri, redactUris, invalidateTenantCache } = require('../../config/tenants');

const SYSTEM_ACTOR = Object.freeze({ userId: null, email: 'system' });
const USAGE = 'Usage: npm run platform:remove-seeded-tenants -- [--apply] [--key <key> ...]';

class UsageError extends Error {}

const parseArgs = (argv) => {
  const opts = { apply: false, keys: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') { opts.help = true; continue; }
    if (arg === '--apply') { opts.apply = true; continue; }
    const [flag, inline] = arg.split(/=(.*)/s, 2);
    if (flag !== '--key') throw new UsageError(`Unknown argument: ${arg}`);
    const value = inline !== undefined ? inline : argv[++i];
    if (value === undefined || value.startsWith('--')) throw new UsageError('--key needs a value');
    opts.keys.push(value.trim().toLowerCase());
  }
  return opts;
};

/**
 * Read-only look at a company database on the shared cluster.
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

/** Tenant records the old seed created (audit: 'tenant.create' by actor 'system'). */
const findSeededTenants = async ({ Tenant, PlatformAuditLog }) => {
  const entries = await PlatformAuditLog.find({
    action: 'tenant.create',
    targetType: 'Tenant',
    'actor.email': 'system',
  }).lean();
  const ids = [...new Set(entries.map((e) => String(e.targetId)))];
  if (!ids.length) return [];
  const tenants = await Tenant.find({ _id: { $in: ids } }).sort({ key: 1 }).lean();
  // Created by a platform user in the console → not the seed's, whatever the log says.
  return tenants.filter((t) => !t.createdBy);
};

/**
 * @param {{ apply?: boolean, keys?: string[], inspect?: (dbName) => Promise<{collections: string[]}>,
 *           log?: (line: string) => void }} o
 * @returns {Promise<{ removed: string[], kept: string[], notFound: string[] }>}
 */
const removeSeededTenants = async ({ apply = false, keys = [], inspect = inspectDatabase, log = console.log } = {}) => {
  const models = platformModels.getPlatformModels();
  const { Tenant, PlatformAuditLog } = models;

  const named = new Set(keys);
  let candidates = await findSeededTenants(models);
  const notFound = [...named].filter((k) => !candidates.some((t) => t.key === k));
  if (named.size) candidates = candidates.filter((t) => named.has(t.key));

  const removed = [];
  const kept = [];

  if (!candidates.length) {
    log('No company records created by the old platform seed were found. Nothing to do.');
  }

  for (const tenant of candidates) {
    let collections = null;
    try {
      ({ collections } = await inspect(tenant.dbName));
    } catch (err) {
      log(`  ${tenant.key}: could not read database "${tenant.dbName}" (${redactUris(err.message)}); kept.`);
      kept.push(tenant.key);
      continue;
    }

    const hasData = collections.length > 0;
    const label = `${tenant.key} (${tenant.name}), database ${tenant.dbName}, status ${tenant.status}, `
      + (hasData ? `${collections.length} collection(s)` : 'database missing or empty');

    if (hasData && !named.has(tenant.key)) {
      log(`  ${label}: kept, its database holds data. Pass --key ${tenant.key} to remove its record anyway.`);
      kept.push(tenant.key);
      continue;
    }

    if (!apply) {
      log(`  ${label}: would be removed`);
      removed.push(tenant.key);
      continue;
    }

    const result = await Tenant.deleteOne({ _id: tenant._id, createdBy: null });
    if (!result || result.deletedCount !== 1) {
      log(`  ${label}: changed while running; kept.`);
      kept.push(tenant.key);
      continue;
    }
    invalidateTenantCache(tenant.key);
    await PlatformAuditLog.record({
      actor: SYSTEM_ACTOR,
      action: 'tenant.delete',
      targetType: 'Tenant',
      targetId: tenant._id,
      targetKey: tenant.key,
      before: tenant,
      after: null,
    });
    log(`  ${label}: removed${hasData ? ' (its database was left as it is)' : ''}`);
    removed.push(tenant.key);
  }

  for (const key of notFound) {
    log(`  ${key}: not a company record created by the old seed; ignored.`);
  }
  return { removed, kept, notFound };
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
        console.log(opts.apply ? 'Removing seeded company records...' : 'Dry run (add --apply to remove):');
        const { removed, kept } = await removeSeededTenants(opts);
        console.log(`\n${opts.apply ? 'Removed' : 'Would remove'} ${removed.length}, kept ${kept.length}.`);
      }
    } catch (err) {
      code = 1;
      console.error(err instanceof UsageError ? `${err.message}\n${USAGE}` : `Error: ${redactUris(err.message)}`);
    }
    await closePlatformDb().catch(() => {});
    process.exit(code);
  })();
}

module.exports = { parseArgs, removeSeededTenants, findSeededTenants };
