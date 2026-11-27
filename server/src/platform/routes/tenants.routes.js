/**
 * /api/platform/tenants — mounted in platform.routes.js behind protectPlatform.
 * Platform auth only; no tenant is resolved. Every route checks a platform
 * permission (config/platformPermissions.js). Every change is written to the
 * platform audit log.
 */
const express = require('express');
const provisioning = require('../services/tenantProvisioning.service');
const tenantAdmin = require('../services/tenantAdmin.service');
const { requirePlatformPermission } = require('../middleware/protectPlatform');

const router = express.Router();

const canView = requirePlatformPermission('platform.tenants.view');

// PATCH /:key changes two kinds of field, each under its own permission.
const DETAIL_FIELDS = ['name', 'contact', 'limits', 'allowSelfSignup'];
const ACCESS_FIELDS = ['enabledModules', 'roleTemplateKeys'];
const editChecks = {
  details: requirePlatformPermission('platform.tenants.edit'),
  access: requirePlatformPermission('platform.tenants.manage_modules'),
};
const requireEditPermissions = (req, res, next) => {
  const fields = Object.keys(req.body || {});
  const needed = [];
  if (fields.some((f) => DETAIL_FIELDS.includes(f))) needed.push(editChecks.details);
  if (fields.some((f) => ACCESS_FIELDS.includes(f))) needed.push(editChecks.access);
  // An empty or unknown-only body still needs one of them; the service then rejects it.
  if (needed.length === 0) needed.push(editChecks.details);
  const run = (i) => (i === needed.length ? next() : needed[i](req, res, () => run(i + 1)));
  return run(0);
};

const actorOf = (req) => ({ userId: req.platformUser._id, email: req.platformUser.email });

// GET /api/platform/tenants?status=&search= — every company, newest first
router.get('/', canView, async (req, res) => {
  const result = await tenantAdmin.listTenants({ status: req.query.status, search: req.query.search });
  res.json({ success: true, ...result });
});

// POST /api/platform/tenants — provision a company (or resume a failed one with the same key)
router.post('/', requirePlatformPermission('platform.tenants.create'), async (req, res) => {
  const result = await provisioning.provisionTenant({ body: req.body || {}, actor: actorOf(req), req });
  res.status(result.resumed ? 200 : 201).json({ success: true, ...result });
});

// GET /api/platform/tenants/:key — company detail with its admins
router.get('/:key', canView, async (req, res) => {
  res.json({ success: true, ...(await tenantAdmin.getTenantDetail(req.params.key)) });
});

// PATCH /api/platform/tenants/:key — { name?, contact?, limits?, allowSelfSignup? } (platform.tenants.edit)
//                                     { enabledModules?, roleTemplateKeys? } (platform.tenants.manage_modules)
router.patch('/:key', requireEditPermissions, async (req, res) => {
  const result = await tenantAdmin.updateTenant({
    key: req.params.key, body: req.body || {}, actor: actorOf(req), req,
  });
  res.json({ success: true, ...result });
});

// POST /api/platform/tenants/:key/suspend — body { reason? }
router.post('/:key/suspend', requirePlatformPermission('platform.tenants.suspend'), async (req, res) => {
  const result = await tenantAdmin.setTenantStatus({
    key: req.params.key, to: 'suspended', reason: req.body?.reason, actor: actorOf(req), req,
  });
  res.json({ success: true, ...result });
});

// POST /api/platform/tenants/:key/reactivate — body { reason? }
router.post('/:key/reactivate', requirePlatformPermission('platform.tenants.suspend'), async (req, res) => {
  const result = await tenantAdmin.setTenantStatus({
    key: req.params.key, to: 'active', reason: req.body?.reason, actor: actorOf(req), req,
  });
  res.json({ success: true, ...result });
});

// POST /api/platform/tenants/:key/archive — body { reason? }. Blocks access, keeps the data.
// There is no delete: companies are never removed through the API.
router.post('/:key/archive', requirePlatformPermission('platform.tenants.suspend'), async (req, res) => {
  const result = await tenantAdmin.setTenantStatus({
    key: req.params.key, to: 'archived', reason: req.body?.reason, actor: actorOf(req), req,
  });
  res.json({ success: true, ...result });
});

// POST /api/platform/tenants/:key/sync-roles — copy the role templates into the company again
router.post('/:key/sync-roles', requirePlatformPermission('platform.tenants.manage_modules'), async (req, res) => {
  res.json({ success: true, ...(await tenantAdmin.resyncTenantRoles({ key: req.params.key, actor: actorOf(req) })) });
});

// POST /api/platform/tenants/:key/resend-invite — body { email? }
router.post('/:key/resend-invite', requirePlatformPermission('platform.tenant_admins.resend_invite'), async (req, res) => {
  const result = await provisioning.resendAdminInvite({
    key: req.params.key,
    email: req.body?.email,
    actor: actorOf(req),
    req,
  });
  res.json({ success: true, ...result });
});

// POST /api/platform/tenants/:key/admins — { name, email }: another company admin
router.post('/:key/admins', requirePlatformPermission('platform.tenant_admins.invite'), async (req, res) => {
  const result = await provisioning.inviteTenantAdmin({ key: req.params.key, body: req.body || {}, actor: actorOf(req), req });
  res.status(201).json({ success: true, ...result });
});

// POST /api/platform/tenants/:key/admins/reset-password — { email }: emails a reset link
router.post('/:key/admins/reset-password', requirePlatformPermission('platform.tenant_admins.reset_password'), async (req, res) => {
  const result = await provisioning.resetAdminPassword({ key: req.params.key, email: req.body?.email, actor: actorOf(req), req });
  res.json({ success: true, ...result });
});

module.exports = router;
