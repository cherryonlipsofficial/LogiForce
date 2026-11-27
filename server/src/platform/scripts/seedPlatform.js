/**
 * Seed the platform database.  npm run platform:seed
 *
 * Run by hand (never on server start or deploy). `npm run platform:create-owner`
 * runs the same steps first, so a fresh install only needs that command.
 * Safe to run any number of times. Each run:
 *   1. connects and syncs indexes for every platform model;
 *   2. creates any missing RoleTemplate from ROLE_TEMPLATES
 *      (config/defaultRoles.js: the default roles without platform-scope
 *      permissions, plus tenant_admin). An existing template is left alone,
 *      because templates are edited in the platform console; one that differs
 *      from the code defaults is reported. With --reset-templates, existing
 *      templates are put back to the code defaults through doc.save() so a
 *      permissions change bumps `version`. It never syncs the templates into
 *      companies: run `npm run platform:sync-roles` for that;
 *   3. creates the platform roles from SYSTEM_PLATFORM_ROLES
 *      (config/platformPermissions.js) that are missing. The locked
 *      platform_owner role's stored permission list is refreshed to the code
 *      list; platform_support is never changed once it exists (Owners edit it);
 *   4. prints created / updated / skipped per collection.
 * It creates no company, no user and no business data.
 * Every create/update is written to platform_audit_logs as actor 'system'.
 *
 * Never prints a URI or a password.
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });

const { connectPlatformDb, closePlatformDb, getPlatformDbName } = require('../db');
const { getPlatformModels, PLATFORM_MODELS } = require('../models');
const { ROLE_TEMPLATES } = require('../../config/defaultRoles');
const { SYSTEM_PLATFORM_ROLES, isLockedPlatformRole } = require('../../config/platformPermissions');

const SYSTEM_ACTOR = Object.freeze({ userId: null, email: 'system' });

const sameSet = (a = [], b = []) => {
  const setA = new Set(a);
  const setB = new Set(b);
  return setA.size === setB.size && [...setA].every((x) => setB.has(x));
};

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
const seedRoleTemplates = async ({ RoleTemplate, PlatformAuditLog }, counts, log, { resetTemplates = false } = {}) => {
  for (const template of ROLE_TEMPLATES) {
    // Run the wanted values through the schema's setters (trim, lowercase, ...)
    // so comparisons below are like for like.
    const wanted = new RoleTemplate({ ...template, permissions: [...template.permissions] });
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

    if (!resetTemplates) {
      // Edited in the platform console: keep it.
      counts.RoleTemplate.skipped += 1;
      log(`  role template ${existing.key}: differs from the code defaults (${changed.join(', ')}); kept. `
        + 'Run with --reset-templates to overwrite it.');
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
const platformRoleSnapshot = (doc) => ({
  key: doc.key,
  displayName: doc.displayName,
  permissions: [...(doc.permissions || [])],
  isSystem: doc.isSystem,
});

const seedPlatformRoles = async ({ PlatformRole, PlatformAuditLog }, counts, log) => {
  for (const def of Object.values(SYSTEM_PLATFORM_ROLES)) {
    const existing = await PlatformRole.findOne({ key: def.key });
    if (!existing) {
      const doc = await PlatformRole.create({
        key: def.key,
        displayName: def.displayName,
        description: def.description,
        permissions: [...def.permissions],
        isSystem: def.isSystem,
      });
      await PlatformAuditLog.record({
        actor: SYSTEM_ACTOR,
        action: 'platformRole.create',
        targetType: 'PlatformRole',
        targetId: doc._id,
        targetKey: doc.key,
        before: null,
        after: platformRoleSnapshot(doc),
      });
      counts.PlatformRole.created += 1;
      counts.PlatformAuditLog.created += 1;
      log(`  platform role ${doc.key}: created`);
      continue;
    }

    // Only the locked role follows the code. Its access comes from the code
    // list anyway; this keeps the stored copy readable.
    if (isLockedPlatformRole(def.key)
      && (!sameSet(existing.permissions, def.permissions) || existing.isSystem !== true)) {
      const before = platformRoleSnapshot(existing);
      existing.permissions = [...def.permissions];
      existing.isSystem = true;
      await existing.save();
      await PlatformAuditLog.record({
        actor: SYSTEM_ACTOR,
        action: 'platformRole.update',
        targetType: 'PlatformRole',
        targetId: existing._id,
        targetKey: existing.key,
        before,
        after: platformRoleSnapshot(existing),
      });
      counts.PlatformRole.updated += 1;
      counts.PlatformAuditLog.created += 1;
      log(`  platform role ${existing.key}: permission list refreshed from the code`);
      continue;
    }
    counts.PlatformRole.skipped += 1;
  }
};

/**
 * Run steps 1–3 on an already-open platform connection.
 * @returns {Record<string, {created: number, updated: number, skipped: number}>}
 */
const seedPlatform = async ({ log = console.log, resetTemplates = false } = {}) => {
  const models = getPlatformModels();
  const counts = {
    RoleTemplate: { created: 0, updated: 0, skipped: 0 },
    PlatformRole: { created: 0, updated: 0, skipped: 0 },
    PlatformAuditLog: { created: 0, updated: 0, skipped: 0 },
  };

  log('Syncing indexes...');
  await syncAllIndexes(models, log);
  log('Role templates...');
  await seedRoleTemplates(models, counts, log, { resetTemplates });
  log('Platform roles...');
  await seedPlatformRoles(models, counts, log);

  return counts;
};

const printSummary = (counts, log = console.log) => {
  log(`\nPlatform seed summary (database: ${getPlatformDbName()})`);
  for (const { name, collection } of PLATFORM_MODELS) {
    const c = counts[name];
    if (!c) continue; // not seeded (e.g. platform_login_challenges)
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
      const counts = await seedPlatform({ resetTemplates: process.argv.includes('--reset-templates') });
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

module.exports = { seedPlatform, printSummary };
