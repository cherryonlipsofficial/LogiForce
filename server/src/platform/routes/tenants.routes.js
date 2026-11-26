/**
 * /api/platform/tenants — mounted in platform.routes.js behind protectPlatform.
 * Platform auth only; no tenant is resolved. Reads: owner or support.
 * Changes: owner only. Every change is written to the platform audit log.
 */
const express = require('express');
const provisioning = require('../services/tenantProvisioning.service');
const tenantAdmin = require('../services/tenantAdmin.service');
const { requirePlatformRole } = require('../middleware/protectPlatform');

const router = express.Router();

const canRead = requirePlatformRole('owner', 'support');
const canWrite = requirePlatformRole('owner');

const actorOf = (req) => ({ userId: req.platformUser._id, email: req.platformUser.email });

// GET /api/platform/tenants?status=&search= — every company, newest first
router.get('/', canRead, async (req, res) => {
  const result = await tenantAdmin.listTenants({ status: req.query.status, search: req.query.search });
  res.json({ success: true, ...result });
});

// POST /api/platform/tenants — provision a company (or resume a failed one with the same key)
router.post('/', canWrite, async (req, res) => {
  const result = await provisioning.provisionTenant({ body: req.body || {}, actor: actorOf(req), req });
  res.status(result.resumed ? 200 : 201).json({ success: true, ...result });
});

// GET /api/platform/tenants/:key — company detail with its admins
router.get('/:key', canRead, async (req, res) => {
  res.json({ success: true, ...(await tenantAdmin.getTenantDetail(req.params.key)) });
});

// PATCH /api/platform/tenants/:key — { name?, enabledModules?, roleTemplateKeys? }
router.patch('/:key', canWrite, async (req, res) => {
  const result = await tenantAdmin.updateTenant({
    key: req.params.key, body: req.body || {}, actor: actorOf(req), req,
  });
  res.json({ success: true, ...result });
});

// POST /api/platform/tenants/:key/suspend — body { reason? }
router.post('/:key/suspend', canWrite, async (req, res) => {
  const result = await tenantAdmin.setTenantStatus({
    key: req.params.key, to: 'suspended', reason: req.body?.reason, actor: actorOf(req), req,
  });
  res.json({ success: true, ...result });
});

// POST /api/platform/tenants/:key/reactivate — body { reason? }
router.post('/:key/reactivate', canWrite, async (req, res) => {
  const result = await tenantAdmin.setTenantStatus({
    key: req.params.key, to: 'active', reason: req.body?.reason, actor: actorOf(req), req,
  });
  res.json({ success: true, ...result });
});

// POST /api/platform/tenants/:key/sync-roles — copy the role templates into the company again
router.post('/:key/sync-roles', canWrite, async (req, res) => {
  res.json({ success: true, ...(await tenantAdmin.resyncTenantRoles({ key: req.params.key, actor: actorOf(req) })) });
});

// POST /api/platform/tenants/:key/resend-invite — body { email? }
router.post('/:key/resend-invite', canWrite, async (req, res) => {
  const result = await provisioning.resendAdminInvite({
    key: req.params.key,
    email: req.body?.email,
    actor: actorOf(req),
    req,
  });
  res.json({ success: true, ...result });
});

module.exports = router;
