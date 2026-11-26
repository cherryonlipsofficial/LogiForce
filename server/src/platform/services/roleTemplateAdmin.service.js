/**
 * Platform console: the shared role templates every company's roles are copied from.
 *
 *   listRoleTemplates   GET   /api/platform/role-templates
 *   updateRoleTemplate  PATCH /api/platform/role-templates/:key
 *
 * An edit is saved with doc.save() (so `version` goes up when permissions
 * change), audited as 'roleTemplate.update', then copied into every company
 * that uses the template with syncTenantsUsingTemplate (roleSync.service.js,
 * moment 3). A company whose sync fails is reported; the edit stands.
 */
const { PERMISSIONS, isPlatformPermission } = require('../../config/permissions');
const { TENANT_ADMIN_TEMPLATE, RETIRED_TEMPLATE_KEYS } = require('../../config/defaultRoles');
const platformModels = require('../models');
const roleSync = require('./roleSync.service');
const { SYSTEM_ACTOR } = require('./platformUser.service');
const { notFound, badRequest, conflict } = require('../errors');

const TENANT_ADMIN_KEY = TENANT_ADMIN_TEMPLATE.key;
const EDITABLE_FIELDS = Object.freeze(['displayName', 'description', 'permissions', 'assignableByTenant']);

const sameSet = (a = [], b = []) => {
  const setA = new Set(a);
  const setB = new Set(b);
  return setA.size === setB.size && [...setA].every((x) => setB.has(x));
};

const snapshot = (t) => ({
  key: t.key,
  displayName: t.displayName,
  description: t.description ?? null,
  permissions: [...(t.permissions || [])],
  assignableByTenant: t.assignableByTenant !== false,
  version: t.version,
});

const publicTemplate = (t, usedBy = []) => ({
  _id: t._id,
  ...snapshot(t),
  retired: RETIRED_TEMPLATE_KEYS.includes(t.key),
  usedBy,
  updatedAt: t.updatedAt ?? null,
});

/** Every template, with the keys of the companies that use it. */
const listRoleTemplates = async () => {
  const { RoleTemplate, Tenant } = platformModels.getPlatformModels();
  const [templates, tenants] = await Promise.all([
    RoleTemplate.find({}).sort({ key: 1 }).lean(),
    Tenant.find({}).select('key roleTemplateKeys').lean(),
  ]);
  return {
    templates: templates.map((t) => publicTemplate(
      t,
      tenants.filter((tenant) => (tenant.roleTemplateKeys || []).includes(t.key)).map((tenant) => tenant.key).sort()
    )),
  };
};

const validateTemplateUpdate = (key, body = {}) => {
  const errors = {};
  const update = {};
  const unknownFields = Object.keys(body).filter((k) => !EDITABLE_FIELDS.includes(k) && k !== 'version');
  if (unknownFields.length) errors.body = `Unknown field(s): ${unknownFields.join(', ')}`;

  if (body.displayName !== undefined) {
    if (typeof body.displayName !== 'string' || !body.displayName.trim()) errors.displayName = 'Display name cannot be empty';
    else update.displayName = body.displayName.trim();
  }
  if (body.description !== undefined) {
    if (body.description !== null && typeof body.description !== 'string') errors.description = 'Description must be text';
    else update.description = body.description === null ? '' : body.description.trim();
  }
  if (body.permissions !== undefined) {
    if (!Array.isArray(body.permissions) || body.permissions.some((p) => typeof p !== 'string')) {
      errors.permissions = 'permissions must be an array of permission keys';
    } else {
      const perms = [...new Set(body.permissions)];
      const unknown = perms.filter((p) => !Object.prototype.hasOwnProperty.call(PERMISSIONS, p));
      const platformOnly = perms.filter(isPlatformPermission);
      if (unknown.length) errors.permissions = `Unknown permission(s): ${unknown.join(', ')}`;
      else if (platformOnly.length) errors.permissions = `Platform permission(s) cannot be in a role template: ${platformOnly.join(', ')}`;
      else update.permissions = perms;
    }
  }
  if (body.assignableByTenant !== undefined) {
    if (typeof body.assignableByTenant !== 'boolean') errors.assignableByTenant = 'assignableByTenant must be true or false';
    // A company admin must never be able to make another company admin.
    else if (key === TENANT_ADMIN_KEY && body.assignableByTenant) {
      errors.assignableByTenant = `"${TENANT_ADMIN_KEY}" can never be assignable by a company`;
    } else update.assignableByTenant = body.assignableByTenant;
  }
  if (body.version !== undefined && !Number.isInteger(body.version)) errors.version = 'version must be an integer';

  if (Object.keys(errors).length) throw badRequest(`Invalid request: ${Object.values(errors).join('; ')}`, errors);
  return update;
};

/**
 * PATCH /api/platform/role-templates/:key — body: any of displayName,
 * description, permissions, assignableByTenant, plus optional `version`: when
 * given, the edit is refused (409 TEMPLATE_STALE) if someone else saved the
 * template since that version was read.
 *
 * @returns {{ template, changed: string[], sync: { ok: string[], failed: {key, error}[] } | null }}
 */
const updateRoleTemplate = async ({ key, body, actor = SYSTEM_ACTOR, req } = {}) => {
  const { RoleTemplate, PlatformAuditLog } = platformModels.getPlatformModels();
  const templateKey = String(key || '').trim().toLowerCase();
  const update = validateTemplateUpdate(templateKey, body || {});

  const doc = await RoleTemplate.findOne({ key: templateKey });
  if (!doc) throw notFound(`No role template "${templateKey}"`);
  if (RETIRED_TEMPLATE_KEYS.includes(doc.key)) {
    throw conflict('TEMPLATE_RETIRED', `"${doc.key}" is retired and can't be edited`);
  }
  if (body?.version !== undefined && body.version !== doc.version) {
    throw conflict('TEMPLATE_STALE',
      `"${doc.key}" was changed by someone else (now version ${doc.version}). Reload it and make your change again.`,
      { currentVersion: doc.version });
  }

  const before = snapshot(doc);
  const changed = Object.keys(update).filter((field) => (field === 'permissions'
    ? !sameSet(doc.permissions, update.permissions)
    : (doc[field] ?? (field === 'description' ? '' : undefined)) !== update[field]));
  if (changed.length === 0) {
    return { template: publicTemplate(doc.toObject()), changed: [], sync: null };
  }

  for (const field of changed) doc[field] = update[field];
  try {
    await doc.save(); // bumps version when permissions changed
  } catch (err) {
    if (err?.name === 'ValidationError') {
      const errors = Object.fromEntries(Object.entries(err.errors).map(([k, e]) => [k, e.message]));
      throw badRequest(`Invalid request: ${Object.values(errors).join('; ')}`, errors);
    }
    throw err;
  }

  const after = snapshot(doc);
  await PlatformAuditLog.record({
    actor,
    action: 'roleTemplate.update',
    targetType: 'RoleTemplate',
    targetId: doc._id,
    targetKey: doc.key,
    before,
    after: {
      ...after,
      permissionsAdded: after.permissions.filter((p) => !before.permissions.includes(p)),
      permissionsRemoved: before.permissions.filter((p) => !after.permissions.includes(p)),
    },
    req,
  });

  const sync = await roleSync.syncTenantsUsingTemplate(doc.key, { actor });
  return { template: publicTemplate(doc.toObject()), changed, sync };
};

module.exports = { listRoleTemplates, updateRoleTemplate, validateTemplateUpdate };
