const express = require('express');
const router = express.Router();
const { protect, requirePermission, requireAnyPermission } = require('../../middleware/auth');
const { getModel } = require('../../config/modelRegistry');
const { getByModule, getAllKeys } = require('../../config/permissions');
const { canAssignRole } = require('../../utils/accessGuards');
const { sendSuccess, sendError } = require('../../utils/responseHelper');

// Roles are read-only for companies. They are defined on the platform
// (RoleTemplate) and copied in by syncTenantRoles; editing moves to
// /api/platform/role-templates. There is no create, update, delete or
// duplicate here.

// All routes require authentication
router.use(protect);

const ACTIVE = { isActive: { $ne: false } };

// ─── Permission keys (for building the admin UI matrix) ─────────────────────

// GET /api/roles/permissions — list all available permission keys grouped by module
router.get('/permissions', async (req, res) => {
  sendSuccess(res, {
    byModule: getByModule(),
    allKeys: getAllKeys(),
  });
});

// ─── Read-only role views ───────────────────────────────────────────────────

// GET /api/roles — list active roles with user counts
router.get('/', requirePermission('roles.view'), async (req, res) => {
  const Role = getModel(req, 'Role');
  const User = getModel(req, 'User');
  const roles = await Role.find(ACTIVE)
    .populate('createdBy', 'name')
    .sort({ name: 1 })
    .lean();

  // Attach user count per role
  const roleCounts = await User.aggregate([
    { $group: { _id: '$roleId', count: { $sum: 1 } } },
  ]);
  const countMap = {};
  for (const rc of roleCounts) {
    if (rc._id) countMap[rc._id.toString()] = rc.count;
  }

  for (const role of roles) {
    role.userCount = countMap[role._id.toString()] || 0;
  }

  sendSuccess(res, roles);
});

// GET /api/roles/assignable — roles the caller may give someone: active,
// assignableByTenant, in the company's allowed set (copied from one of
// Tenant.roleTemplateKeys), and no permission the caller lacks. Same rule as
// assertCanAssignRole (utils/accessGuards.js). Must stay above /:id.
router.get('/assignable', requireAnyPermission(['users.manage_access', 'users.create']), async (req, res) => {
  const Role = getModel(req, 'Role');
  const roles = await Role.find(ACTIVE)
    .select('name displayName description permissions isActive assignableByTenant templateKey')
    .sort({ name: 1 })
    .lean();
  sendSuccess(res, roles.filter((role) => canAssignRole(req, role)));
});

// GET /api/roles/:id — role detail with assigned users (active roles only)
router.get('/:id', requirePermission('roles.view'), async (req, res) => {
  const Role = getModel(req, 'Role');
  const User = getModel(req, 'User');
  const role = await Role.findById(req.params.id)
    .populate('createdBy', 'name')
    .populate('updatedBy', 'name');

  if (!role || role.isActive === false) return sendError(res, 'Role not found', 404);

  const users = await User.find({ roleId: role._id })
    .select('name email isActive lastLogin createdAt')
    .sort({ name: 1 })
    .lean();

  sendSuccess(res, { ...role.toObject(), users });
});

module.exports = router;
