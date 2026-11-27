/**
 * /api/platform/users and /api/platform/roles — platform staff and their
 * roles. Mounted in platform.routes.js behind protectPlatform. The rules
 * (no self-change, no granting above your own access, Owner-only Owners, last
 * Owner kept) live in services/platformAdmin.service.js.
 */
const express = require('express');
const admin = require('../services/platformAdmin.service');
const { requirePlatformPermission, requireAnyPlatformPermission } = require('../middleware/protectPlatform');

const canViewUsers = requirePlatformPermission('platform.users.view');
const canManageUsers = requirePlatformPermission('platform.users.manage');
const canManageRoles = requirePlatformPermission('platform.roles.manage');
// The role list is needed to pick a role for a user, and to manage roles.
const canViewRoles = requireAnyPlatformPermission(['platform.users.view', 'platform.roles.manage']);

const users = express.Router();

users.get('/', canViewUsers, async (req, res) => {
  res.json({ success: true, ...(await admin.listUsers()) });
});

// POST /api/platform/users — { email, name, roleKey }
users.post('/', canManageUsers, async (req, res) => {
  const result = await admin.inviteUser({ body: req.body || {}, actor: req.platformUser, req });
  res.status(201).json({ success: true, ...result });
});

// PATCH /api/platform/users/:id/role — { roleKey }
users.patch('/:id/role', canManageUsers, async (req, res) => {
  const result = await admin.changeUserRole({ id: req.params.id, roleKey: req.body?.roleKey, actor: req.platformUser, req });
  res.json({ success: true, ...result });
});

users.post('/:id/deactivate', canManageUsers, async (req, res) => {
  res.json({ success: true, ...(await admin.setUserActive({ id: req.params.id, active: false, actor: req.platformUser, req })) });
});

users.post('/:id/reactivate', canManageUsers, async (req, res) => {
  res.json({ success: true, ...(await admin.setUserActive({ id: req.params.id, active: true, actor: req.platformUser, req })) });
});

users.post('/:id/resend-invite', canManageUsers, async (req, res) => {
  res.json({ success: true, ...(await admin.resendUserInvite({ id: req.params.id, actor: req.platformUser, req })) });
});

const roles = express.Router();

roles.get('/', canViewRoles, async (req, res) => {
  res.json({ success: true, ...(await admin.listRoles()) });
});

// POST /api/platform/roles — { key, displayName, description?, permissions }
roles.post('/', canManageRoles, async (req, res) => {
  res.status(201).json({ success: true, ...(await admin.createRole({ body: req.body || {}, actor: req.platformUser, req })) });
});

// PATCH /api/platform/roles/:key — { displayName?, description?, permissions? }
roles.patch('/:key', canManageRoles, async (req, res) => {
  const result = await admin.updateRole({ key: req.params.key, body: req.body || {}, actor: req.platformUser, req });
  res.json({ success: true, ...result });
});

roles.delete('/:key', canManageRoles, async (req, res) => {
  res.json({ success: true, ...(await admin.deleteRole({ key: req.params.key, actor: req.platformUser, req })) });
});

module.exports = { users, roles };
