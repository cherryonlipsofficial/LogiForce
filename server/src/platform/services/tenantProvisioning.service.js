/**
 * Provision a company in one call: POST /api/platform/tenants.
 *
 *   1. validate the body (key rule + reserved keys from models/Tenant.js)
 *   2. create the Tenant with status 'provisioning'
 *   3. open its database, check it holds no data, build every tenant model's indexes
 *   4. syncTenantRoles (always includes tenant_admin)
 *   5. create CompanySettings (company name only; no other company's details)
 *   6. create the admin user on tenant_admin and email a set-password link
 *   7. status 'active', audit 'tenant.provision'
 *
 * Any failure after step 2 sets status 'failed', stores { step, message } in
 * provisioningError, audits 'tenant.provisionFailed' and throws a
 * TenantProvisioningError. Every step can run again, so the same request
 * resumes a failed company: a 'failed' (or abandoned 'provisioning') tenant with
 * the same key is picked up instead of being reported as taken.
 *
 * Never logs or returns a URI.
 */
const crypto = require('crypto');
const logger = require('../../utils/logger');
const email = require('../../utils/email');
const connectionManager = require('../../config/connectionManager');
const { getModelForConnection, schemas } = require('../../config/modelRegistry');
const { mapTenantRecord, redactUris, invalidateTenantCache } = require('../../config/tenants');
const { MODULES } = require('../../config/permissions');
const { TENANT_ADMIN_TEMPLATE, RETIRED_TEMPLATE_KEYS } = require('../../config/defaultRoles');
const {
  generateResetToken,
  buildResetPasswordUrl,
  PASSWORD_RESET_TTL_MS,
} = require('../../modules/shared/passwordReset.helpers');
const platformModels = require('../models');
const { tenantKeyProblem } = require('../models/Tenant');
const roleSync = require('./roleSync.service');
const { SYSTEM_ACTOR, normalizeEmail } = require('./platformUser.service');

const TENANT_APP_DOMAIN = 'logiforce.app';
const TENANT_ADMIN_KEY = TENANT_ADMIN_TEMPLATE.key;

// A 'provisioning' tenant whose last attempt started longer ago than this is
// treated as abandoned (e.g. the server restarted mid-way) and may be resumed.
const PROVISIONING_LOCK_MS = 5 * 60 * 1000;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** https://<key>.logiforce.app — where the company's users sign in. */
const tenantAppUrl = (key) => `https://${key}.${TENANT_APP_DOMAIN}`;

// CompanySettings' schema defaults are one real company's details (name, TRN,
// bank account, invoice prefix). A new company starts with its own name and
// these fields empty; its admin fills them in under Settings.
const initialCompanySettings = (companyName) => ({
  companyName,
  addressLine1: '',
  addressLine2: '',
  email: '',
  trn: '',
  phone: '',
  bankAccountName: '',
  bankName: '',
  bankAccountNo: '',
  bankIban: '',
  invoicePrefix: 'INV',
});

class TenantProvisioningError extends Error {
  constructor(status, code, message, extra = undefined) {
    super(message);
    this.name = 'TenantProvisioningError';
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

const badRequest = (message, errors) => new TenantProvisioningError(400, 'VALIDATION_ERROR', message, { errors });

const emailNotConfigured = () => new TenantProvisioningError(
  503, 'EMAIL_NOT_CONFIGURED',
  'Email is not configured on the server (RESEND_API_KEY), so the admin invite cannot be sent. Nothing was created.'
);

const isNonEmptyString = (v) => typeof v === 'string' && v.trim().length > 0;

const isDuplicateKeyError = (err) => err?.code === 11000 || /E11000/.test(err?.message || '');

/**
 * Step 1 without the database: shape and values of the body.
 * @returns normalised input; throws a 400 TenantProvisioningError listing every problem.
 */
const validateProvisionInput = (body = {}) => {
  const errors = {};
  const key = typeof body.key === 'string' ? body.key.trim().toLowerCase() : '';
  const keyProblem = tenantKeyProblem(key);
  if (keyProblem) errors.key = keyProblem;

  if (!isNonEmptyString(body.name)) errors.name = 'Company name is required';
  if (!isNonEmptyString(body.adminName)) errors.adminName = 'Admin name is required';

  const adminEmail = normalizeEmail(body.adminEmail);
  if (!EMAIL_PATTERN.test(adminEmail)) errors.adminEmail = 'Admin email is not a valid email address';

  let enabledModules = [];
  if (!Array.isArray(body.enabledModules) || body.enabledModules.some((m) => typeof m !== 'string')) {
    errors.enabledModules = 'enabledModules must be an array of module names';
  } else {
    enabledModules = [...new Set(body.enabledModules)];
    const unknown = enabledModules.filter((m) => !MODULES.includes(m));
    if (unknown.length) errors.enabledModules = `Unknown module(s): ${unknown.join(', ')}. Known: ${MODULES.join(', ')}`;
  }

  let roleTemplateKeys = [];
  if (!Array.isArray(body.roleTemplateKeys) || body.roleTemplateKeys.some((k) => typeof k !== 'string')) {
    errors.roleTemplateKeys = 'roleTemplateKeys must be an array of role template keys';
  } else {
    roleTemplateKeys = [...new Set(body.roleTemplateKeys.map((k) => k.trim().toLowerCase()))];
    const retired = roleTemplateKeys.filter((k) => RETIRED_TEMPLATE_KEYS.includes(k));
    if (retired.length) {
      errors.roleTemplateKeys = `Retired role template(s): ${retired.join(', ')}. The company admin role is `
        + `"${TENANT_ADMIN_KEY}", which every company gets automatically.`;
    }
    // Every company gets the admin role; it isn't optional.
    if (!roleTemplateKeys.includes(TENANT_ADMIN_KEY)) roleTemplateKeys.unshift(TENANT_ADMIN_KEY);
  }

  if (Object.keys(errors).length) {
    throw badRequest(`Invalid request: ${Object.values(errors).join('; ')}`, errors);
  }

  return {
    key,
    name: body.name.trim(),
    adminName: body.adminName.trim(),
    adminEmail,
    enabledModules,
    roleTemplateKeys,
  };
};

// ── Step helpers (each safe to run again) ──

/** Refuse to provision on top of a database that already holds documents. */
const assertDatabaseHoldsNoData = async (conn, dbName) => {
  const collections = await conn.db.listCollections({}, { nameOnly: true }).toArray();
  const withData = [];
  for (const { name } of collections) {
    if (name.startsWith('system.')) continue;
    if ((await conn.db.collection(name).estimatedDocumentCount()) > 0) withData.push(name);
  }
  if (withData.length) {
    throw new Error(`database "${dbName}" already holds data (${withData.sort().join(', ')}). `
      + 'Refusing to provision a new company on top of it; choose another key or empty that database.');
  }
};

/** Create (or fix) the indexes of every tenant model. */
const buildIndexes = async (conn) => {
  for (const modelName of Object.keys(schemas)) {
    const Model = getModelForConnection(conn, modelName);
    await Model.init();       // autoCreate/autoIndex triggered by registering the model
    await Model.syncIndexes();
  }
};

const ensureCompanySettings = async (conn, companyName) => {
  const CompanySettings = getModelForConnection(conn, 'CompanySettings');
  // Upsert on {} so two attempts can't both create a document.
  await CompanySettings.updateOne(
    {},
    { $setOnInsert: initialCompanySettings(companyName) },
    { upsert: true }
  );
};

/** The company's admin user, created or put (back) on the tenant_admin role. */
const ensureAdminUser = async (conn, { adminName, adminEmail }, roleId) => {
  const User = getModelForConnection(conn, 'User');
  let user = await User.findOne({ email: adminEmail });
  if (!user) {
    try {
      // `password` is required by the schema. A random one nobody knows: the
      // admin chooses theirs through the emailed link.
      user = await User.create({
        name: adminName,
        email: adminEmail,
        password: crypto.randomBytes(32).toString('hex'),
        roleId,
        isActive: true,
        activatedAt: new Date(),
      });
      return { user, created: true };
    } catch (err) {
      if (!isDuplicateKeyError(err)) throw err;
      user = await User.findOne({ email: adminEmail }); // created in parallel
      if (!user) throw err;
    }
  }
  if (String(user.roleId) !== String(roleId) || !user.isActive) {
    await User.updateOne(
      { _id: user._id },
      { $set: { roleId, isActive: true, activatedAt: user.activatedAt || new Date() } }
    );
  }
  return { user, created: false };
};

/**
 * Step 6's email: a password-reset token on the user and the standard reset
 * email, pointing at https://<key>.logiforce.app/reset-password/<token>. The
 * token is removed again if the email can't be sent. Also used by resend-invite.
 *
 * @returns {Promise<{ email: string, expiresAt: Date }>}
 */
const sendTenantAdminInvite = async ({ tenant, conn, user }) => {
  const User = getModelForConnection(conn, 'User');
  const { token, tokenHash } = generateResetToken();
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS);
  await User.updateOne(
    { _id: user._id },
    { $set: { passwordResetTokenHash: tokenHash, passwordResetExpires: expiresAt } }
  );

  const resetUrl = buildResetPasswordUrl(null, token, tenantAppUrl(tenant.key));
  try {
    await email.sendPasswordResetEmail({
      to: user.email,
      name: user.name,
      resetUrl,
      tenantName: tenant.name,
      expiresMinutes: Math.floor(PASSWORD_RESET_TTL_MS / 60000),
    });
  } catch (err) {
    await User.updateOne(
      { _id: user._id, passwordResetTokenHash: tokenHash },
      { $set: { passwordResetTokenHash: null, passwordResetExpires: null } }
    ).catch(() => {});
    throw new Error(`could not send the invite email to ${user.email}: ${err.message}`);
  }
  return { email: user.email, expiresAt };
};

/** An unexpired reset token on the user means a previous attempt's email went out. */
const liveInvite = async (conn, userId) => {
  const User = getModelForConnection(conn, 'User');
  const u = await User.findById(userId).select('+passwordResetTokenHash +passwordResetExpires').lean();
  return u?.passwordResetTokenHash && u.passwordResetExpires > new Date() ? u.passwordResetExpires : null;
};

const publicTenant = (t) => ({
  _id: t._id,
  key: t.key,
  name: t.name,
  dbName: t.dbName,
  status: t.status,
  enabledModules: t.enabledModules,
  roleTemplateKeys: t.roleTemplateKeys,
  adminEmail: t.adminEmail,
  url: tenantAppUrl(t.key),
  provisioning: t.provisioning,
  provisioningError: t.provisioningError ?? null,
  createdAt: t.createdAt,
  updatedAt: t.updatedAt,
});

// ── Step 1 + 2: validate, then create or claim the Tenant record ──

const claimTenant = async (input, actor, req) => {
  const { Tenant, RoleTemplate, PlatformAuditLog } = platformModels.getPlatformModels();

  const found = await RoleTemplate.find({ key: { $in: input.roleTemplateKeys } }).select('key').lean();
  const missing = input.roleTemplateKeys.filter((k) => !found.some((t) => t.key === k));
  if (missing.length) {
    throw badRequest(`Unknown role template(s): ${missing.join(', ')}`, {
      roleTemplateKeys: `Unknown role template(s): ${missing.join(', ')}`,
    });
  }

  const now = new Date();
  const fields = {
    name: input.name,
    adminEmail: input.adminEmail,
    enabledModules: input.enabledModules,
    roleTemplateKeys: input.roleTemplateKeys,
  };

  const existing = await Tenant.findOne({ key: input.key }).lean();
  if (existing) {
    if (!['failed', 'provisioning'].includes(existing.status)) {
      throw new TenantProvisioningError(409, 'TENANT_KEY_TAKEN', `The key "${input.key}" is already taken`);
    }
    const startedAt = existing.provisioning?.startedAt || null;
    if (existing.status === 'provisioning' && startedAt && now - startedAt < PROVISIONING_LOCK_MS) {
      throw new TenantProvisioningError(409, 'PROVISIONING_IN_PROGRESS',
        `"${input.key}" is being provisioned right now. Try again in a few minutes if it doesn't finish.`);
    }
    // Claim it: only one request can move it out of the state we just read.
    const claimed = await Tenant.findOneAndUpdate(
      { _id: existing._id, status: existing.status, 'provisioning.startedAt': startedAt },
      { $set: { ...fields, status: 'provisioning', 'provisioning.startedAt': now, provisioningError: null } },
      { new: true, runValidators: true }
    ).lean();
    if (!claimed) {
      throw new TenantProvisioningError(409, 'PROVISIONING_IN_PROGRESS',
        `"${input.key}" is being provisioned by another request.`);
    }
    await PlatformAuditLog.record({
      actor,
      action: 'tenant.provisionRetry',
      targetType: 'Tenant',
      targetId: claimed._id,
      targetKey: claimed.key,
      before: { status: existing.status, provisioningError: existing.provisioningError, ...pick(existing, fields) },
      after: { status: claimed.status, ...pick(claimed, fields) },
      req,
    });
    return { tenant: claimed, resumed: true };
  }

  let doc;
  try {
    doc = await Tenant.create({
      key: input.key,
      ...fields,
      status: 'provisioning',
      createdBy: actor?.userId ?? null,
      provisioning: { startedAt: now },
    });
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      const which = /dbName/.test(err.message) ? 'Its database name is already registered to another company.' : '';
      throw new TenantProvisioningError(409, 'TENANT_KEY_TAKEN', `The key "${input.key}" is already taken. ${which}`.trim());
    }
    if (err?.name === 'ValidationError') {
      const errors = Object.fromEntries(Object.entries(err.errors).map(([k, e]) => [k, e.message]));
      throw badRequest(`Invalid request: ${Object.values(errors).join('; ')}`, errors);
    }
    throw err;
  }
  await PlatformAuditLog.record({
    actor,
    action: 'tenant.create',
    targetType: 'Tenant',
    targetId: doc._id,
    targetKey: doc.key,
    before: null,
    after: doc.toObject(),
    req,
  });
  return { tenant: doc.toObject(), resumed: false };
};

const pick = (obj, fields) => Object.fromEntries(Object.keys(fields).map((k) => [k, obj[k]]));

// ── The whole thing ──

/**
 * @param {object} args
 * @param {object} args.body    { key, name, adminName, adminEmail, enabledModules, roleTemplateKeys }
 * @param {{userId?: *, email: string}} [args.actor]  the platform user (audit)
 * @param {import('express').Request} [args.req]
 * @returns {Promise<{ tenant: object, resumed: boolean, roles: object, admin: object }>}
 * @throws {TenantProvisioningError}
 */
const provisionTenant = async ({ body, actor = SYSTEM_ACTOR, req } = {}) => {
  const input = validateProvisionInput(body);
  if (!email.isEmailConfigured()) throw emailNotConfigured();

  const { tenant: claimed, resumed } = await claimTenant(input, actor, req);
  const { Tenant, PlatformAuditLog } = platformModels.getPlatformModels();
  let tenant = claimed;
  let step = 'connect';

  try {
    const conn = await connectionManager.getConnectionForTenant(mapTenantRecord(tenant));

    step = 'checkDatabase';
    if (!tenant.provisioning?.dbCheckedAt) {
      await assertDatabaseHoldsNoData(conn, tenant.dbName);
      await Tenant.updateOne({ _id: tenant._id }, { $set: { 'provisioning.dbCheckedAt': new Date() } });
    }

    step = 'indexes';
    await buildIndexes(conn);

    step = 'roles';
    const roles = await roleSync.syncTenantRoles(tenant, { actor });
    if (roles.conflicts.length || roles.missingTemplates.length) {
      const why = [
        ...roles.conflicts.map((c) => `${c.templateKey}: ${c.reason}`),
        ...roles.missingTemplates.map((k) => `${k}: no such role template`),
      ];
      throw new Error(`role sync could not set up every role (${why.join('; ')})`);
    }
    const Role = getModelForConnection(conn, 'Role');
    const adminRole = await Role.findOne({ templateKey: TENANT_ADMIN_KEY, isActive: { $ne: false } }).lean();
    if (!adminRole) throw new Error(`no active ${TENANT_ADMIN_KEY} role after the role sync`);

    step = 'companySettings';
    await ensureCompanySettings(conn, tenant.name);

    step = 'adminUser';
    const { user, created } = await ensureAdminUser(conn, input, adminRole._id);

    step = 'invite';
    let invite;
    const pendingUntil = created ? null : await liveInvite(conn, user._id);
    if (pendingUntil) {
      invite = { email: user.email, expiresAt: pendingUntil, sent: false, note: 'an earlier attempt already sent a link that is still valid' };
    } else {
      invite = { ...(await sendTenantAdminInvite({ tenant, conn, user })), sent: true };
    }

    step = 'activate';
    const before = { status: tenant.status };
    tenant = await Tenant.findOneAndUpdate(
      { _id: tenant._id },
      { $set: { status: 'active', 'provisioning.completedAt': new Date(), provisioningError: null } },
      { new: true }
    ).lean();
    invalidateTenantCache(tenant.key);

    await PlatformAuditLog.record({
      actor,
      action: 'tenant.provision',
      targetType: 'Tenant',
      targetId: tenant._id,
      targetKey: tenant.key,
      before,
      after: {
        ...publicTenant(tenant),
        resumed,
        rolesCreated: roles.created,
        adminUserId: user._id,
        adminUserCreated: created,
        inviteSent: invite.sent,
      },
      req,
    });

    return {
      tenant: publicTenant(tenant),
      resumed,
      roles: { created: roles.created, updated: roles.updated, unchanged: roles.unchanged },
      admin: { email: user.email, created, invite },
    };
  } catch (err) {
    const message = redactUris(err?.message || String(err));
    try {
      await Tenant.updateOne(
        { _id: tenant._id },
        { $set: { status: 'failed', provisioningError: { step, message, at: new Date() } } }
      );
      invalidateTenantCache(tenant.key);
      await PlatformAuditLog.record({
        actor,
        action: 'tenant.provisionFailed',
        targetType: 'Tenant',
        targetId: tenant._id,
        targetKey: tenant.key,
        before: null,
        after: { status: 'failed', step, error: message },
        req,
      });
    } catch (recordErr) {
      logger.error(`[Provisioning] ${tenant.key}: could not record the failure: ${redactUris(recordErr?.message)}`);
    }
    logger.error(`[Provisioning] ${tenant.key} failed at ${step}: ${message}`);
    throw new TenantProvisioningError(500, 'PROVISIONING_FAILED',
      `Provisioning "${tenant.key}" failed at step "${step}": ${message}. The company is marked failed; `
      + 'fix the cause and send the same request again to resume.',
      { tenantKey: tenant.key, step, retryable: true });
  }
};

/**
 * POST /api/platform/tenants/:key/resend-invite — send the company admin a new
 * set-password link (step 6's email). `email` defaults to the admin recorded at
 * provisioning; the user must be on the tenant_admin role.
 */
const resendAdminInvite = async ({ key, email: requestedEmail, actor = SYSTEM_ACTOR, req } = {}) => {
  const { Tenant, PlatformAuditLog } = platformModels.getPlatformModels();
  const tenantKey = String(key || '').trim().toLowerCase();
  const tenant = await Tenant.findOne({ key: tenantKey }).lean();
  if (!tenant) throw new TenantProvisioningError(404, 'TENANT_NOT_FOUND', `No company with key "${tenantKey}"`);
  if (tenant.status !== 'active') {
    throw new TenantProvisioningError(409, 'TENANT_NOT_ACTIVE',
      `"${tenant.key}" is ${tenant.status}. The link only works for an active company`
      + (tenant.status === 'failed' ? '; retry POST /api/platform/tenants to finish provisioning (it sends the invite).' : '.'));
  }

  const target = normalizeEmail(requestedEmail || tenant.adminEmail);
  if (!target) {
    throw badRequest('This company has no admin email on record; pass { "email": "..." }', {
      email: 'required for this company',
    });
  }
  if (!EMAIL_PATTERN.test(target)) throw badRequest('email is not a valid email address', { email: 'not valid' });
  if (!email.isEmailConfigured()) throw emailNotConfigured();

  const conn = await connectionManager.getConnectionForTenant(mapTenantRecord(tenant));
  const User = getModelForConnection(conn, 'User');
  const Role = getModelForConnection(conn, 'Role');
  const user = await User.findOne({ email: target });
  if (!user) throw new TenantProvisioningError(404, 'ADMIN_NOT_FOUND', `No user ${target} in "${tenant.key}"`);
  const role = await Role.findById(user.roleId).select('templateKey').lean();
  if (role?.templateKey !== TENANT_ADMIN_KEY) {
    throw new TenantProvisioningError(409, 'NOT_COMPANY_ADMIN',
      `${target} is not on the company admin role (${TENANT_ADMIN_KEY}) in "${tenant.key}"`);
  }

  let invite;
  try {
    invite = await sendTenantAdminInvite({ tenant, conn, user });
  } catch (err) {
    throw new TenantProvisioningError(502, 'EMAIL_SEND_FAILED', redactUris(err.message));
  }

  await PlatformAuditLog.record({
    actor,
    action: 'tenant.adminInviteSent',
    targetType: 'Tenant',
    targetId: tenant._id,
    targetKey: tenant.key,
    after: { email: invite.email, expiresAt: invite.expiresAt },
    req,
  });
  return { tenantKey: tenant.key, invite };
};

module.exports = {
  TENANT_APP_DOMAIN,
  PROVISIONING_LOCK_MS,
  TenantProvisioningError,
  tenantAppUrl,
  initialCompanySettings,
  validateProvisionInput,
  sendTenantAdminInvite,
  provisionTenant,
  resendAdminInvite,
};
