/**
 * Seed the platform database.  npm run platform:seed
 *
 * Safe to run any number of times. Each run:
 *   1. connects and syncs indexes for the four platform models;
 *   2. creates/updates one RoleTemplate per default role (config/defaultRoles.js);
 *   3. creates the first owner account from PLATFORM_OWNER_* (never touches an
 *      existing account or its password);
 *   4. registers the tenants that were hardcoded in config/tenants.js (now
 *      scripts/legacyTenants.js), recording the
 *      database each one actually uses today;
 *   5. prints created / updated / skipped per collection.
 * Every create/update is written to platform_audit_logs as actor 'system'.
 *
 * Never prints a URI or a password.
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });

const { connectPlatformDb, closePlatformDb, getPlatformDbName } = require('../db');
const { getPlatformModels, PLATFORM_MODELS } = require('../models');
const { MODULES } = require('../../config/permissions');
const { defaultRoles } = require('../../config/defaultRoles');

const SYSTEM_ACTOR = Object.freeze({ userId: null, email: 'system' });

// Env vars that can supply each legacy tenant's URI (see legacyTenants.js).
// Used to record which one is actually in use (Tenant.dbUriEnv). null means the
// URI is derived from MONGODB_BASE_URI + database name.
const LEGACY_URI_ENV_CANDIDATES = Object.freeze({
  'logi-force': ['MONGODB_URI_MAIN', 'MONGODB_URI'],
  clienta: ['MONGODB_URI_CLIENTA'],
  clientb: ['MONGODB_URI_CLIENTB'],
  clientc: ['MONGODB_URI_CLIENTC'],
});

const sameSet = (a = [], b = []) => {
  const setA = new Set(a);
  const setB = new Set(b);
  return setA.size === setB.size && [...setA].every((x) => setB.has(x));
};

/**
 * Database a URI connects to when no dbName option is passed (which is how the
 * tenant connection manager connects today): the URI path, else the driver's
 * default 'test'.
 */
const dbNameFromUri = (uri) => {
  const match = /^mongodb(?:\+srv)?:\/\/[^/?#]+\/([^?#]*)/.exec(uri || '');
  const name = match ? decodeURIComponent(match[1]) : '';
  return name || 'test';
};

/**
 * What a hardcoded tenant really uses today, worked out from the URI that
 * legacyTenants.js resolves in this environment.
 */
const resolveLegacyTenant = (key, tenantConfig) => {
  const uri = tenantConfig.dbUri;
  if (!uri) return { dbName: null, dbUriEnv: null };
  const candidates = LEGACY_URI_ENV_CANDIDATES[key] || [];
  return {
    dbName: dbNameFromUri(uri),
    dbUriEnv: candidates.find((name) => process.env[name] && process.env[name] === uri) || null,
  };
};

const templateFromRole = (role) => ({
  key: role.name,
  displayName: role.displayName,
  description: role.description,
  permissions: [...new Set(role.permissions)],
  // The company admin role (the system role) is not handed out by tenants.
  assignableByTenant: role.isSystemRole !== true,
});

const templateSnapshot = (doc) => ({
  key: doc.key,
  displayName: doc.displayName,
  description: doc.description,
  permissions: [...(doc.permissions || [])],
  assignableByTenant: doc.assignableByTenant,
  version: doc.version,
});

// ── Step 1 ──
const syncAllIndexes = async (models, log) => {
  for (const { name, collection } of PLATFORM_MODELS) {
    const model = models[name];
    await model.init(); // let autoCreate/autoIndex finish before syncing
    const dropped = await model.syncIndexes();
    if (dropped && dropped.length) log(`  ${collection}: dropped stale index(es) ${dropped.join(', ')}`);
  }
};

// ── Step 2 ──
const seedRoleTemplates = async ({ RoleTemplate, PlatformAuditLog }, counts, log) => {
  for (const role of defaultRoles) {
    // Run the wanted values through the schema's setters (trim, lowercase, ...)
    // so comparisons below are like for like.
    const wanted = new RoleTemplate(templateFromRole(role));
    const existing = await RoleTemplate.findOne({ key: wanted.key });

    if (!existing) {
      const doc = await wanted.save();
      await PlatformAuditLog.record({
        actor: SYSTEM_ACTOR,
        action: 'roleTemplate.create',
        targetType: 'RoleTemplate',
        targetId: doc._id,
        targetKey: doc.key,
        before: null,
        after: templateSnapshot(doc),
      });
      counts.RoleTemplate.created += 1;
      counts.PlatformAuditLog.created += 1;
      log(`  role template ${doc.key}: created`);
      continue;
    }

    const changed = [];
    if (existing.displayName !== wanted.displayName) changed.push('displayName');
    if ((existing.description ?? null) !== (wanted.description ?? null)) changed.push('description');
    if (!sameSet(existing.permissions, wanted.permissions)) changed.push('permissions');
    if (existing.assignableByTenant !== wanted.assignableByTenant) changed.push('assignableByTenant');

    if (changed.length === 0) {
      counts.RoleTemplate.skipped += 1;
      continue;
    }

    const before = templateSnapshot(existing);
    for (const field of changed) {
      existing[field] = field === 'permissions' ? [...wanted.permissions] : wanted[field];
    }
    await existing.save(); // save() (not a query update) so a permissions change bumps version

    await PlatformAuditLog.record({
      actor: SYSTEM_ACTOR,
      action: 'roleTemplate.update',
      targetType: 'RoleTemplate',
      targetId: existing._id,
      targetKey: existing.key,
      before,
      after: templateSnapshot(existing),
    });
    counts.RoleTemplate.updated += 1;
    counts.PlatformAuditLog.created += 1;
    log(`  role template ${existing.key}: updated ${changed.join(', ')} (version ${before.version} → ${existing.version})`);
  }
};

// ── Step 3 ──
const seedOwner = async ({ PlatformUser, PlatformAuditLog }, counts, log) => {
  const email = (process.env.PLATFORM_OWNER_EMAIL || '').trim();
  const password = process.env.PLATFORM_OWNER_PASSWORD || '';
  const name = (process.env.PLATFORM_OWNER_NAME || '').trim() || 'Platform Owner';

  if (email && password) {
    const existing = await PlatformUser.findOne({ email: email.toLowerCase() });
    if (existing) {
      counts.PlatformUser.skipped += 1;
      log('  owner exists, skipped');
      return;
    }

    const user = new PlatformUser({ email, name, role: 'owner', status: 'active' });
    await user.setPassword(password);
    await user.save();

    await PlatformAuditLog.record({
      actor: SYSTEM_ACTOR,
      action: 'platformUser.create',
      targetType: 'PlatformUser',
      targetId: user._id,
      targetKey: user.email,
      before: null,
      after: user.toJSON(),
    });
    counts.PlatformUser.created += 1;
    counts.PlatformAuditLog.created += 1;
    log(`  owner created: ${user.email}`);
    return;
  }

  if (email || password) {
    log('  WARNING: PLATFORM_OWNER_EMAIL and PLATFORM_OWNER_PASSWORD must both be set to create the owner account.');
  }
  const owners = await PlatformUser.countDocuments({ role: 'owner' });
  if (owners === 0) {
    log('  WARNING: there is no platform owner account. Set PLATFORM_OWNER_EMAIL, PLATFORM_OWNER_NAME and '
      + 'PLATFORM_OWNER_PASSWORD (12+ characters), then run this seed again.');
  }
};

// ── Step 4 ──
const seedLegacyTenants = async ({ Tenant, RoleTemplate, PlatformAuditLog }, counts, log) => {
  const { tenants } = require('./legacyTenants');
  const entries = Object.entries(tenants || {});
  if (entries.length === 0) {
    log('  no hardcoded tenant list found, skipped');
    return;
  }

  const roleTemplateKeys = (await RoleTemplate.distinct('key')).sort();

  for (const [rawKey, tenantConfig] of entries) {
    const key = rawKey.toLowerCase();

    if (await Tenant.exists({ key })) {
      counts.Tenant.skipped += 1;
      continue;
    }

    const live = resolveLegacyTenant(key, tenantConfig);
    if (!live.dbName) {
      counts.Tenant.skipped += 1;
      log(`  WARNING: tenant ${key} skipped: no MongoDB URI is configured for it in this environment, so the `
        + 'database it uses cannot be determined. Run the seed with the same env as the server to register it.');
      continue;
    }

    if (live.dbName !== tenantConfig.dbName) {
      log(`  NOTE: tenant ${key} is labelled "${tenantConfig.dbName}" in legacyTenants.js, but its URI points at `
        + `database "${live.dbName}". Recording "${live.dbName}" (the database it uses today).`);
    }

    const clash = await Tenant.findOne({ dbName: live.dbName }, { key: 1 }).lean();
    if (clash) {
      counts.Tenant.skipped += 1;
      log(`  WARNING: tenant ${key} skipped: database "${live.dbName}" is already registered to tenant ${clash.key}.`);
      continue;
    }

    let doc;
    try {
      doc = await Tenant.create({
        key,
        name: tenantConfig.name,
        dbName: live.dbName,
        dbUriEnv: live.dbUriEnv,
        status: 'active',
        enabledModules: [...MODULES],
        roleTemplateKeys,
        limits: { maxUsers: null },
        allowSelfSignup: false,
        createdBy: null,
      });
    } catch (err) {
      throw new Error(`tenant ${key}: ${err.message}`);
    }

    await PlatformAuditLog.record({
      actor: SYSTEM_ACTOR,
      action: 'tenant.create',
      targetType: 'Tenant',
      targetId: doc._id,
      targetKey: doc.key,
      before: null,
      after: doc.toObject(),
    });
    counts.Tenant.created += 1;
    counts.PlatformAuditLog.created += 1;
    log(`  tenant ${doc.key}: created (database ${doc.dbName}, URI from ${doc.dbUriEnv || 'MONGODB_BASE_URI'})`);
  }
};

/**
 * Run steps 1–4 on an already-open platform connection.
 * @returns {Record<string, {created: number, updated: number, skipped: number}>}
 */
const seedPlatform = async ({ log = console.log } = {}) => {
  const models = getPlatformModels();
  const counts = {
    RoleTemplate: { created: 0, updated: 0, skipped: 0 },
    PlatformUser: { created: 0, updated: 0, skipped: 0 },
    Tenant: { created: 0, updated: 0, skipped: 0 },
    PlatformAuditLog: { created: 0, updated: 0, skipped: 0 },
  };

  log('Syncing indexes...');
  await syncAllIndexes(models, log);
  log('Role templates...');
  await seedRoleTemplates(models, counts, log);
  log('Owner account...');
  await seedOwner(models, counts, log);
  log('Existing tenants (legacyTenants.js)...');
  await seedLegacyTenants(models, counts, log);

  return counts;
};

const printSummary = (counts, log = console.log) => {
  log(`\nPlatform seed summary (database: ${getPlatformDbName()})`);
  for (const { name, collection } of PLATFORM_MODELS) {
    const c = counts[name];
    const line = name === 'PlatformAuditLog'
      ? `created ${c.created}`
      : `created ${c.created}  updated ${c.updated}  skipped ${c.skipped}`;
    log(`  ${collection.padEnd(20)} ${line}`);
  }
};

if (require.main === module) {
  (async () => {
    try {
      await connectPlatformDb();
      const counts = await seedPlatform();
      printSummary(counts);
      await closePlatformDb();
      process.exit(0);
    } catch (err) {
      console.error(`Platform seed failed: ${err.message}`);
      await closePlatformDb().catch(() => {});
      process.exit(1);
    }
  })();
}

module.exports = { seedPlatform, printSummary, dbNameFromUri, resolveLegacyTenant };
