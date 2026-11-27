/**
 * Platform console: read and change companies after they are provisioned.
 *
 *   listTenants      GET  /api/platform/tenants
 *   getTenantDetail  GET  /api/platform/tenants/:key
 *   updateTenant     PATCH /api/platform/tenants/:key   (name, contact, limits, allowSelfSignup,
 *                                                       enabledModules, roleTemplateKeys)
 *   setTenantStatus  POST /api/platform/tenants/:key/suspend | /reactivate | /archive
 *   resyncTenantRoles POST /api/platform/tenants/:key/sync-roles
 *
 * Companies are never deleted here: archiving blocks access and keeps the data.
 * Every change is written to the platform audit log. A change to
 * enabledModules or roleTemplateKeys runs syncTenantRoles for that company
 * afterwards (roleSync.service.js, moment 2). The tenant cache is invalidated
 * after every write so this process serves the new record at once; other
 * server processes pick it up within TENANT_CACHE_TTL_MS.
 *
 * Never logs or returns a URI.
 */
const connectionManager = require('../../config/connectionManager');
const { getModelForConnection } = require('../../config/modelRegistry');
const { mapTenantRecord, redactUris, invalidateTenantCache } = require('../../config/tenants');
const { MODULES } = require('../../config/permissions');
const { TENANT_ADMIN_TEMPLATE, RETIRED_TEMPLATE_KEYS } = require('../../config/defaultRoles');
const platformModels = require('../models');
const roleSync = require('./roleSync.service');
const { SYSTEM_ACTOR } = require('./platformUser.service');
const { tenantAppUrl } = require('../../config/appDomain');
const { notFound, badRequest, conflict } = require('../errors');

const TENANT_ADMIN_KEY = TENANT_ADMIN_TEMPLATE.key;

// Companies whose settings can be changed. A 'provisioning' company is
// finished (or retried) through POST /api/platform/tenants instead; an
// archived one must be reactivated first.
const EDITABLE_STATUSES = Object.freeze(['active', 'suspended']);

const normaliseKey = (key) => String(key || '').trim().toLowerCase();

const sameSet = (a = [], b = []) => {
  const setA = new Set(a);
  const setB = new Set(b);
  return setA.size === setB.size && [...setA].every((x) => setB.has(x));
};

const tenantSummary = (t) => ({
  _id: t._id,
  key: t.key,
  name: t.name,
  status: t.status,
  adminEmail: t.adminEmail ?? null,
  contact: { name: t.contact?.name || '', email: t.contact?.email || '', phone: t.contact?.phone || '' },
  enabledModules: t.enabledModules || [],
  roleTemplateKeys: t.roleTemplateKeys || [],
  url: tenantAppUrl(t.key),
  createdAt: t.createdAt,
  updatedAt: t.updatedAt,
});

const tenantDetail = (t) => ({
  ...tenantSummary(t),
  dbName: t.dbName,
  limits: { maxUsers: t.limits?.maxUsers ?? null },
  allowSelfSignup: t.allowSelfSignup === true,
  provisioning: t.provisioning ?? null,
  provisioningError: t.provisioningError ?? null,
});

const findTenantOr404 = async (key) => {
  const { Tenant } = platformModels.getPlatformModels();
  const tenantKey = normaliseKey(key);
  const tenant = await Tenant.findOne({ key: tenantKey }).lean();
  if (!tenant) throw notFound(`No company with key "${tenantKey}"`);
  return tenant;
};

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * @param {{ status?: string, search?: string }} [filters]
 */
const listTenants = async ({ status, search } = {}) => {
  const { Tenant } = platformModels.getPlatformModels();
  const filter = {};
  if (status) filter.status = String(status);
  const q = String(search || '').trim();
  if (q) {
    const re = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ key: re }, { name: re }];
  }
  const tenants = await Tenant.find(filter).sort({ createdAt: -1 }).lean();
  return { tenants: tenants.map(tenantSummary) };
};

/**
 * The company's admins: users on its tenant_admin role. Reads the company's
 * own database; if that can't be reached, admins is null and adminsError says why.
 */
const loadAdmins = async (tenant) => {
  try {
    const conn = await connectionManager.getConnectionForTenant(mapTenantRecord(tenant));
    const Role = getModelForConnection(conn, 'Role');
    const User = getModelForConnection(conn, 'User');
    const adminRoles = await Role.find({ templateKey: TENANT_ADMIN_KEY }).select('_id').lean();
    const admins = adminRoles.length === 0 ? [] : await User.find({ roleId: { $in: adminRoles.map((r) => r._id) } })
      .select('name email isActive lastLogin createdAt')
      .sort({ name: 1 })
      .lean();
    const activeUsers = await User.countDocuments({ isActive: true });
    return {
      admins: admins.map((u) => ({
        _id: u._id,
        name: u.name,
        email: u.email,
        isActive: u.isActive !== false,
        lastLogin: u.lastLogin ?? null,
        createdAt: u.createdAt ?? null,
      })),
      activeUsers,
      adminsError: null,
    };
  } catch (err) {
    return { admins: null, activeUsers: null, adminsError: redactUris(err?.message || String(err)) };
  }
};

const getTenantDetail = async (key) => {
  const tenant = await findTenantOr404(key);
  const { admins, activeUsers, adminsError } = await loadAdmins(tenant);
  return { tenant: { ...tenantDetail(tenant), activeUsers }, admins, adminsError };
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** { name, email, phone } from a request body, or an error message. */
const parseContact = (contact) => {
  if (contact === null || typeof contact !== 'object' || Array.isArray(contact)) return { error: 'contact must be an object' };
  const unknown = Object.keys(contact).filter((k) => !['name', 'email', 'phone'].includes(k));
  if (unknown.length) return { error: `Unknown contact field(s): ${unknown.join(', ')}` };
  const out = {};
  for (const field of ['name', 'email', 'phone']) {
    if (contact[field] === undefined) continue;
    if (typeof contact[field] !== 'string') return { error: `contact.${field} must be text` };
    out[field] = contact[field].trim();
  }
  if (out.email) {
    out.email = out.email.toLowerCase();
    if (!EMAIL_PATTERN.test(out.email)) return { error: 'contact.email is not a valid email address' };
  }
  return { value: out };
};

/** maxUsers: null (unlimited) or a whole number ≥ 1. */
const parseLimits = (limits) => {
  if (limits === null || typeof limits !== 'object' || Array.isArray(limits)) return { error: 'limits must be an object' };
  const unknown = Object.keys(limits).filter((k) => k !== 'maxUsers');
  if (unknown.length) return { error: `Unknown limit(s): ${unknown.join(', ')}` };
  if (limits.maxUsers === undefined) return { value: {} };
  if (limits.maxUsers === null || limits.maxUsers === '') return { value: { maxUsers: null } };
  const n = Number(limits.maxUsers);
  if (!Number.isInteger(n) || n < 1) return { error: 'limits.maxUsers must be a whole number of at least 1, or null for no limit' };
  return { value: { maxUsers: n } };
};

/**
 * Check and normalise a PATCH body. Company details (name, contact, limits,
 * allowSelfSignup) and access (enabledModules, roleTemplateKeys) can change
 * here; the route checks the permission for each kind.
 */
const validateUpdate = async (body = {}) => {
  const errors = {};
  const update = {};
  const allowed = ['name', 'contact', 'limits', 'allowSelfSignup', 'enabledModules', 'roleTemplateKeys'];
  const unknownFields = Object.keys(body).filter((k) => !allowed.includes(k));
  if (unknownFields.length) errors.body = `Unknown field(s): ${unknownFields.join(', ')}. Allowed: ${allowed.join(', ')}`;

  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || !body.name.trim()) errors.name = 'Company name cannot be empty';
    else update.name = body.name.trim();
  }

  if (body.contact !== undefined) {
    const { value, error } = parseContact(body.contact);
    if (error) errors.contact = error;
    else for (const [k, v] of Object.entries(value)) update[`contact.${k}`] = v;
  }

  if (body.limits !== undefined) {
    const { value, error } = parseLimits(body.limits);
    if (error) errors.limits = error;
    else if ('maxUsers' in value) update['limits.maxUsers'] = value.maxUsers;
  }

  if (body.allowSelfSignup !== undefined) {
    if (typeof body.allowSelfSignup !== 'boolean') errors.allowSelfSignup = 'allowSelfSignup must be true or false';
    else update.allowSelfSignup = body.allowSelfSignup;
  }

  if (body.enabledModules !== undefined) {
    if (!Array.isArray(body.enabledModules) || body.enabledModules.some((m) => typeof m !== 'string')) {
      errors.enabledModules = 'enabledModules must be an array of module names';
    } else {
      const modules = [...new Set(body.enabledModules)];
      const unknown = modules.filter((m) => !MODULES.includes(m));
      if (unknown.length) errors.enabledModules = `Unknown module(s): ${unknown.join(', ')}`;
      else update.enabledModules = modules;
    }
  }

  if (body.roleTemplateKeys !== undefined) {
    if (!Array.isArray(body.roleTemplateKeys) || body.roleTemplateKeys.some((k) => typeof k !== 'string')) {
      errors.roleTemplateKeys = 'roleTemplateKeys must be an array of role template keys';
    } else {
      const keys = [...new Set(body.roleTemplateKeys.map((k) => k.trim().toLowerCase()))];
      const retired = keys.filter((k) => RETIRED_TEMPLATE_KEYS.includes(k));
      if (retired.length) {
        errors.roleTemplateKeys = `Retired role template(s): ${retired.join(', ')}`;
      } else {
        // Every company keeps its admin role.
        if (!keys.includes(TENANT_ADMIN_KEY)) keys.unshift(TENANT_ADMIN_KEY);
        const { RoleTemplate } = platformModels.getPlatformModels();
        const found = await RoleTemplate.find({ key: { $in: keys } }).select('key').lean();
        const missing = keys.filter((k) => !found.some((t) => t.key === k));
        if (missing.length) errors.roleTemplateKeys = `Unknown role template(s): ${missing.join(', ')}`;
        else update.roleTemplateKeys = keys;
      }
    }
  }

  if (Object.keys(errors).length) {
    throw badRequest(`Invalid request: ${Object.values(errors).join('; ')}`, errors);
  }
  return update;
};

/** { 'contact.email': x } → { contact: { email: x } }, for audit snapshots. */
const nest = (flat) => {
  const out = {};
  for (const [path, value] of Object.entries(flat)) {
    const keys = path.split('.');
    let cur = out;
    for (const k of keys.slice(0, -1)) cur = (cur[k] ||= {});
    cur[keys.at(-1)] = value;
  }
  return out;
};

/** Run syncTenantRoles and report its outcome instead of throwing. */
const syncRolesReport = async (tenant, actor) => {
  try {
    const summary = await roleSync.syncTenantRoles(tenant, { actor });
    return {
      ok: true,
      created: summary.created,
      updated: summary.updated,
      deactivated: summary.deactivated,
      conflicts: summary.conflicts,
      missingTemplates: summary.missingTemplates,
      usersOnDeactivatedRoles: summary.usersOnDeactivatedRoles,
    };
  } catch (err) {
    return { ok: false, error: redactUris(err?.message || String(err)) };
  }
};

/**
 * PATCH /api/platform/tenants/:key
 * @returns {{ tenant, changed: string[], roleSync: object|null }}
 *   roleSync is null when neither modules nor allowed roles changed. A failed
 *   sync doesn't undo the change; roleSync.ok is false and it can be retried
 *   with POST /tenants/:key/sync-roles.
 */
const updateTenant = async ({ key, body, actor = SYSTEM_ACTOR, req } = {}) => {
  const { Tenant, PlatformAuditLog } = platformModels.getPlatformModels();
  const tenant = await findTenantOr404(key);
  if (!EDITABLE_STATUSES.includes(tenant.status)) {
    throw conflict('TENANT_NOT_EDITABLE',
      `"${tenant.key}" is ${tenant.status}. Finish provisioning it (POST /api/platform/tenants) before changing it.`);
  }
  const update = await validateUpdate(body);

  const current = (field) => field.split('.').reduce((v, k) => (v == null ? undefined : v[k]), tenant);
  const changed = Object.keys(update).filter((field) => (Array.isArray(update[field])
    ? !sameSet(current(field), update[field])
    : (current(field) ?? null) !== (update[field] ?? null)));
  if (changed.length === 0) return { tenant: tenantDetail(tenant), changed: [], roleSync: null };

  const set = Object.fromEntries(changed.map((f) => [f, update[f]]));
  // Match on the status we read, so a concurrent suspend/provision can't be overwritten blindly.
  const saved = await Tenant.findOneAndUpdate(
    { _id: tenant._id, status: tenant.status },
    { $set: set },
    { new: true, runValidators: true }
  ).lean();
  if (!saved) throw conflict('TENANT_CHANGED', `"${tenant.key}" changed while saving; reload and try again.`);
  invalidateTenantCache(saved.key);

  await PlatformAuditLog.record({
    actor,
    action: 'tenant.update',
    targetType: 'Tenant',
    targetId: saved._id,
    targetKey: saved.key,
    before: nest(Object.fromEntries(changed.map((f) => [f, current(f) ?? null]))),
    after: nest(set),
    req,
  });

  const needsSync = changed.includes('enabledModules') || changed.includes('roleTemplateKeys');
  const roleSyncResult = needsSync ? await syncRolesReport(saved, actor) : null;
  return { tenant: tenantDetail(saved), changed, roleSync: roleSyncResult };
};

const STATUS_CHANGES = Object.freeze({
  suspended: { from: ['active'], action: 'tenant.suspend', verb: 'suspended' },
  active: { from: ['suspended', 'archived'], action: 'tenant.reactivate', verb: 'reactivated' },
  archived: { from: ['active', 'suspended'], action: 'tenant.archive', verb: 'archived' },
});

/**
 * POST /api/platform/tenants/:key/suspend    → 'suspended' (from active)
 * POST /api/platform/tenants/:key/reactivate → 'active'    (from suspended or archived)
 * POST /api/platform/tenants/:key/archive    → 'archived'  (from active or suspended)
 * resolveTenant refuses a suspended or archived company's requests (403) and
 * the scheduled jobs skip it. Nothing is deleted: its database is kept as is.
 */
const setTenantStatus = async ({ key, to, reason, actor = SYSTEM_ACTOR, req } = {}) => {
  const change = STATUS_CHANGES[to];
  if (!change) throw badRequest(`Unknown status "${to}"`);
  const { Tenant, PlatformAuditLog } = platformModels.getPlatformModels();
  const tenant = await findTenantOr404(key);
  if (!change.from.includes(tenant.status)) {
    throw conflict('TENANT_STATUS', `"${tenant.key}" is ${tenant.status}; only a ${change.from.join(' or ')} company `
      + `can be ${change.verb}.`);
  }
  const note = typeof reason === 'string' ? reason.trim().slice(0, 500) : '';

  const saved = await Tenant.findOneAndUpdate(
    { _id: tenant._id, status: tenant.status },
    { $set: { status: to } },
    { new: true }
  ).lean();
  if (!saved) throw conflict('TENANT_CHANGED', `"${tenant.key}" changed while saving; reload and try again.`);
  invalidateTenantCache(saved.key);

  await PlatformAuditLog.record({
    actor,
    action: change.action,
    targetType: 'Tenant',
    targetId: saved._id,
    targetKey: saved.key,
    before: { status: tenant.status },
    after: { status: saved.status, ...(note ? { reason: note } : {}) },
    req,
  });
  return { tenant: tenantDetail(saved) };
};

/** POST /api/platform/tenants/:key/sync-roles — run the role sync again (e.g. after it failed). */
const resyncTenantRoles = async ({ key, actor = SYSTEM_ACTOR } = {}) => {
  const tenant = await findTenantOr404(key);
  if (!EDITABLE_STATUSES.includes(tenant.status)) {
    throw conflict('TENANT_NOT_EDITABLE', `"${tenant.key}" is ${tenant.status}; finish provisioning it first.`);
  }
  return { tenantKey: tenant.key, roleSync: await syncRolesReport(tenant, actor) };
};

module.exports = {
  EDITABLE_STATUSES,
  listTenants,
  getTenantDetail,
  updateTenant,
  setTenantStatus,
  resyncTenantRoles,
};
