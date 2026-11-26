/**
 * /api/platform/role-templates — mounted in platform.routes.js behind
 * protectPlatform. Reads: owner or support. Edits: owner only; each edit is
 * audited and synced into every company that uses the template.
 */
const express = require('express');
const roleTemplates = require('../services/roleTemplateAdmin.service');
const { requirePlatformRole } = require('../middleware/protectPlatform');

const router = express.Router();

router.get('/', requirePlatformRole('owner', 'support'), async (req, res) => {
  res.json({ success: true, ...(await roleTemplates.listRoleTemplates()) });
});

// PATCH /api/platform/role-templates/:key — { displayName?, description?, permissions?, assignableByTenant?, version? }
router.patch('/:key', requirePlatformRole('owner'), async (req, res) => {
  const result = await roleTemplates.updateRoleTemplate({
    key: req.params.key,
    body: req.body || {},
    actor: { userId: req.platformUser._id, email: req.platformUser.email },
    req,
  });
  res.json({ success: true, ...result });
});

module.exports = router;
