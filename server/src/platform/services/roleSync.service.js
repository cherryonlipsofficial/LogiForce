/**
 * Copy platform role templates into company databases.
 *
 * syncTenantRoles(tenant) makes the company's roles match the RoleTemplates
 * named in tenant.roleTemplateKeys, each limited to the company's ceiling
 * (tenantCeiling: core modules + enabledModules, never platform permissions):
 *
 * A template's role is found by templateKey first, then by name:
 *   - one role whose templateKey is the template's key
 *                                                → that role, whatever its name
 *                                                  (e.g. the old 'admin' role the
 *                                                  migration linked to tenant_admin)
 *   - several roles with that templateKey        → skipped, reported as a conflict
 *   - none: a role named exactly like the key    → that role, unless it is linked
 *                                                  to another template (conflict)
 *
 *   - no role found                              → role created (managedBy 'platform'),
 *                                                  named after the key
 *   - a role found that is platform-managed, or that predates Phase 2
 *     (no managedBy stored)                     → updated to match the template
 *                                                  (its name is never changed)
 *   - a role found with managedBy 'tenant',
 *     or one that matches only ignoring case     → skipped, reported as a conflict
 *   - a platform-managed role whose template the company no longer has
 *                                                → isActive false (never deleted:
 *                                                  users still point at it)
 *
 * It never deletes a role, never touches a role with managedBy 'tenant', and
 * never sets isSystemRole on an existing role (scripts/migrateToPlatform.js
 * turns it off on the old admin role). New roles get isSystemRole false.
 *
 * Call it at three moments (the platform routes for these don't exist yet):
 *   1. A company is created: after the Tenant is saved and its database can be
 *      reached. If the sync throws, leave the company in 'provisioning' and
 *      return the error; never mark a company active without its roles.
 *   2. A company's enabledModules or roleTemplateKeys change: after saving.
 *   3. A RoleTemplate's permissions, displayName, description or
 *      assignableByTenant change: after save(), call syncTenantsUsingTemplate
 *      and include its result in the response. A failed company does not undo
 *      the template edit.
 *
 * Never logs or returns a URI.
 */
const connectionManager = require('../../config/connectionManager');
const { getModelForConnection } = require('../../config/modelRegistry');
const { tenantCeiling } = require('../../config/permissions');
const { mapTenantRecord, redactUris } = require('../../config/tenants');
const platformModels = require('../models');
const { SYSTEM_ACTOR } = require('./platformUser.service');
const logger = require('../../utils/logger');

const sameSet = (a = [], b = []) => {
  const setA = new Set(a);
  const setB = new Set(b);
  return setA.size === setB.size && [...setA].every((x) => setB.has(x));
};

// Fields the sync owns on a platform-managed role, in the order they are reported.
const SYNCED_FIELDS = [
  'displayName', 'description', 'permissions', 'templateKey', 'managedBy',
  'assignableByTenant', 'templateVersion', 'isActive',
];

/** What a template's role should look like in this company. */
const desiredRole = (template, ceiling) => ({
  displayName: template.displayName,
  description: template.description ?? null,
  permissions: [...new Set(template.permissions || [])].filter((key) => ceiling.has(key)),
  templateKey: template.key,
  managedBy: 'platform',
  assignableByTenant: template.assignableByTenant !== false,
  templateVersion: template.version,
  isActive: true,
});

/**
 * How a stored role differs from the desired one, or null if it doesn't.
 * `existing` is a lean document: a field missing from the database counts as
 * different, so roles that predate Phase 2 get every field written once.
 */
const diffRole = (existing, desired) => {
  const fields = SYNCED_FIELDS.filter((field) => {
    if (field === 'permissions') return !sameSet(existing.permissions, desired.permissions);
    if (field === 'description') return (existing.description ?? null) !== desired.description;
    return existing[field] !== desired[field];
  });
  if (fields.length === 0) return null;

  const before = new Set(existing.permissions || []);
  const after = new Set(desired.permissions);
  return {
    fields,
    permissionsAdded: desired.permissions.filter((key) => !before.has(key)),
    permissionsRemoved: [...before].filter((key) => !after.has(key)),
    ...(existing.managedBy !== 'platform' ? { adopted: true } : {}),
  };
};

/**
 * Work out what a sync would do. Pure: reads and writes nothing.
 *
 * @param {object}      args
 * @param {string[]}    args.roleTemplateKeys  the company's Tenant.roleTemplateKeys
 * @param {Set<string>} args.ceiling           tenantCeiling(tenant)
 * @param {object[]}    args.templates         RoleTemplate records (lean) for those keys
 * @param {object[]}    args.roles             every Role in the company database (lean:
 *                                             stored fields only, no schema defaults)
 * @returns {{ upserts: {name: string, id?: *, set: object}[], deactivateIds: *[],
 *             inactiveRoleIds: *[], summary: object }}
 */
const planRoleSync = ({ roleTemplateKeys, ceiling, templates, roles }) => {
  const keys = [...new Set(roleTemplateKeys || [])];
  const keySet = new Set(keys);
  const templatesByKey = new Map(templates.map((t) => [t.key, t]));
  const summary = {
    created: [],
    updated: [],
    unchanged: [],
    deactivated: [],
    conflicts: [],
    missingTemplates: [],
    changes: {},
  };
  const upserts = [];
  const switchedOn = new Set(); // names of roles this sync leaves active

  for (const key of keys) {
    const template = templatesByKey.get(key);
    if (!template) {
      summary.missingTemplates.push(key);
      continue;
    }

    let existing;
    const linked = roles.filter((r) => r.templateKey === key);
    if (linked.length > 1) {
      for (const r of linked) {
        summary.conflicts.push({
          templateKey: key,
          roleName: r.name,
          reason: `${linked.length} roles (${linked.map((x) => `"${x.name}"`).join(', ')}) are linked to "${key}"`,
        });
      }
      continue;
    }

    if (linked.length === 1) {
      [existing] = linked;
    } else {
      const nearDuplicates = roles.filter((r) => r.name !== key && String(r.name).toLowerCase() === key.toLowerCase());
      if (nearDuplicates.length > 0) {
        for (const r of nearDuplicates) {
          summary.conflicts.push({
            templateKey: key,
            roleName: r.name,
            reason: `the company has a role "${r.name}" that differs from "${key}" only in letter case`,
          });
        }
        continue;
      }

      existing = roles.find((r) => r.name === key);
      if (existing && existing.templateKey && existing.templateKey !== key) {
        summary.conflicts.push({
          templateKey: key,
          roleName: existing.name,
          reason: `the company's role "${existing.name}" is linked to template "${existing.templateKey}"`,
        });
        continue;
      }
    }

    if (existing && existing.managedBy === 'tenant') {
      summary.conflicts.push({
        templateKey: key,
        roleName: existing.name,
        reason: `the company's role "${existing.name}" has managedBy "tenant", so the sync may not change it`,
      });
      continue;
    }

    const desired = desiredRole(template, ceiling);

    if (!existing) {
      switchedOn.add(key);
      upserts.push({ name: key, set: desired });
      summary.created.push(key);
      summary.changes[key] = {
        fields: [...SYNCED_FIELDS],
        permissionsAdded: [...desired.permissions],
        permissionsRemoved: [],
      };
      continue;
    }

    switchedOn.add(existing.name);
    const diff = diffRole(existing, desired);
    if (!diff) {
      summary.unchanged.push(existing.name);
      continue;
    }
    upserts.push({ name: existing.name, id: existing._id, set: desired });
    summary.updated.push(existing.name);
    summary.changes[existing.name] = diff;
  }

  // Platform roles whose template the company no longer has: switch off.
  const deactivateIds = [];
  for (const r of roles) {
    if (r.managedBy !== 'platform' || keySet.has(r.templateKey) || r.isActive === false) continue;
    deactivateIds.push(r._id);
    summary.deactivated.push(r.name);
  }

  // Every platform role that is off once this sync is done: switched off now, or
  // earlier and not switched back on (e.g. its template is missing or in conflict).
  const switchedOff = new Set(deactivateIds.map(String));
  const inactiveRoleIds = roles
    .filter((r) => r.managedBy === 'platform'
      && (switchedOff.has(String(r._id)) || (r.isActive === false && !switchedOn.has(r.name))))
    .map((r) => r._id);

  return { upserts, deactivateIds, inactiveRoleIds, summary };
};

const toPlain = (record) => (record && typeof record.toObject === 'function' ? record.toObject() : record);

/**
 * Make a company's roles match its role templates. Works for any status,
 * including 'provisioning'.
 *
 * @param {object}  tenant  Tenant record from the platform DB (document or lean)
 * @param {object}  [options]
 * @param {boolean} [options.dryRun=false]  work out the same summary, write nothing
 *                                          (not even indexes: it opens its own connection)
 * @param {{userId?: *, email: string}} [options.actor]  for the audit entry; defaults to 'system'
 * @returns {Promise<{ tenantKey: string, dryRun: boolean,
 *   created: string[], updated: string[], unchanged: string[], deactivated: string[],
 *   conflicts: {templateKey: string, roleName: string, reason: string}[],
 *   missingTemplates: string[], usersOnDeactivatedRoles: number,
 *   changes: Record<string, {fields: string[], permissionsAdded: string[],
 *                            permissionsRemoved: string[], adopted?: true}> }>}
 *   Role names in created/updated/unchanged/deactivated. usersOnDeactivatedRoles
 *   counts users whose roleId is a platform role that is off after this sync.
 *   Rejects if the company's database can't be reached or a write fails.
 */
const syncTenantRoles = async (tenant, { dryRun = false, actor = SYSTEM_ACTOR } = {}) => {
  const record = toPlain(tenant);
  const { RoleTemplate, PlatformAuditLog } = platformModels.getPlatformModels();
  const roleTemplateKeys = [...new Set(record.roleTemplateKeys || [])];
  const ceiling = tenantCeiling(record);
  const templates = await RoleTemplate.find({ key: { $in: roleTemplateKeys } }).lean();

  const tenantConfig = mapTenantRecord(record); // throws if the company's URI can't be built
  const conn = dryRun
    ? await connectionManager.openUncachedConnection(tenantConfig)
    : await connectionManager.getConnectionForTenant(tenantConfig);

  try {
    const Role = getModelForConnection(conn, 'Role');
    const User = getModelForConnection(conn, 'User');
    if (!dryRun) await Role.init(); // the unique index on name must exist before upserting

    const roles = await Role.find({}).lean();
    const plan = planRoleSync({ roleTemplateKeys, ceiling, templates, roles });
    const summary = { tenantKey: record.key, dryRun, ...plan.summary, usersOnDeactivatedRoles: 0 };

    if (!dryRun) {
      const written = [];
      let failure = null;
      try {
        for (const { name, id, set } of plan.upserts) {
          if (id) {
            // An existing role (found by templateKey or name): update it by _id.
            await Role.updateOne({ _id: id, managedBy: { $ne: 'tenant' } }, { $set: set });
          } else {
            // `managedBy $ne 'tenant'` keeps a company role created since the read
            // above out of reach: the upsert then fails on the unique name instead.
            await Role.updateOne(
              { name, managedBy: { $ne: 'tenant' } },
              { $set: set, $setOnInsert: { isSystemRole: false } },
              { upsert: true }
            );
          }
          written.push(name);
        }
        if (plan.deactivateIds.length > 0) {
          await Role.updateMany(
            { _id: { $in: plan.deactivateIds }, managedBy: 'platform', templateKey: { $nin: roleTemplateKeys } },
            { $set: { isActive: false } }
          );
          written.push(...summary.deactivated);
        }
      } catch (err) {
        failure = err;
      }

      if (!failure) {
        summary.usersOnDeactivatedRoles = await User.countDocuments({ roleId: { $in: plan.inactiveRoleIds } });
      }

      await PlatformAuditLog.record({
        actor,
        action: 'tenant.rolesSynced',
        targetType: 'Tenant',
        targetId: record._id,
        targetKey: record.key,
        before: null,
        after: failure
          ? { ...summary, error: redactUris(failure.message), written }
          : summary,
      });
      if (failure) throw failure;
      return summary;
    }

    summary.usersOnDeactivatedRoles = await User.countDocuments({ roleId: { $in: plan.inactiveRoleIds } });
    return summary;
  } finally {
    if (dryRun) await conn.close().catch(() => {});
  }
};

/**
 * Sync every company (any status) whose roleTemplateKeys include `templateKey`,
 * one at a time. A failure for one company is caught and reported; the others
 * still run.
 *
 * @returns {Promise<{ ok: string[], failed: {key: string, error: string}[] }>}
 */
const syncTenantsUsingTemplate = async (templateKey, { actor = SYSTEM_ACTOR } = {}) => {
  const { Tenant } = platformModels.getPlatformModels();
  const tenants = await Tenant.find({ roleTemplateKeys: templateKey }).sort({ key: 1 }).lean();
  const ok = [];
  const failed = [];

  for (const tenant of tenants) {
    try {
      await syncTenantRoles(tenant, { actor });
      ok.push(tenant.key);
    } catch (err) {
      const error = redactUris(err?.message);
      failed.push({ key: tenant.key, error });
      logger.error(`[RoleSync] ${tenant.key}: sync after template ${templateKey} changed failed: ${error}`);
    }
  }
  return { ok, failed };
};

module.exports = { syncTenantRoles, syncTenantsUsingTemplate, planRoleSync };
