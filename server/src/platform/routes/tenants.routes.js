/**
 * /api/platform/tenants — mounted in platform.routes.js behind protectPlatform
 * and requirePlatformRole('owner'). Platform auth only; no tenant is resolved.
 */
const express = require('express');
const provisioning = require('../services/tenantProvisioning.service');

const router = express.Router();

const actorOf = (req) => ({ userId: req.platformUser._id, email: req.platformUser.email });

// POST /api/platform/tenants — provision a company (or resume a failed one with the same key)
router.post('/', async (req, res) => {
  const result = await provisioning.provisionTenant({ body: req.body || {}, actor: actorOf(req), req });
  res.status(result.resumed ? 200 : 201).json({ success: true, ...result });
});

// POST /api/platform/tenants/:key/resend-invite — body { email? }
router.post('/:key/resend-invite', async (req, res) => {
  const result = await provisioning.resendAdminInvite({
    key: req.params.key,
    email: req.body?.email,
    actor: actorOf(req),
    req,
  });
  res.json({ success: true, ...result });
});

module.exports = router;
