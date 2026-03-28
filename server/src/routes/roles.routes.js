const express = require('express');
const router = express.Router();
const { protect, requirePermission } = require('../middleware/auth');
const { Role, User } = require('../models');
const { PERMISSIONS, getByModule, getAllKeys, migrateLegacyKeys } = require('../config/permissions');
const { sendSuccess, sendError } = require('../utils/responseHelper');

// All routes require authentication
router.use(protect);

// ─── Permission keys (for building the admin UI matrix) ─────────────────────

// GET /api/roles/permissions — list all available permission keys grouped by module
router.get('/permissions', async (req, res) => {
  sendSuccess(res, {
    byModule: getByModule(),
    allKeys: getAllKeys(),
  });
});

// ─── Role CRUD ──────────────────────────────────────────────────────────────

// GET /api/roles — list all roles with user counts
router.get('/', requirePermission('roles.manage'), async (req, res) => {
  const roles = await Role.find()
    .populate('createdBy', 'name')
    .sort({ isSystemRole: -1, name: 1 })
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

// POST /api/roles — create a new role
router.post('/', requirePermission('roles.manage'), async (req, res) => {
  const { name, displayName, description, permissions } = req.body;

  if (!name || !displayName) {
    return sendError(res, 'name and displayName are required');
  }

  // Validate name format: lowercase, no spaces, slug-like
  const slugRegex = /^[a-z][a-z0-9_]*$/;
  if (!slugRegex.test(name)) {
    return sendError(res, 'name must be lowercase alphanumeric with underscores, starting with a letter');
  }

  // Check uniqueness
  const existing = await Role.findOne({ name });
  if (existing) {
    return sendError(res, `Role "${name}" already exists`, 409);
  }

  // Migrate legacy permission keys and validate
  const resolvedPerms = permissions ? migrateLegacyKeys(permissions) : [];
  if (resolvedPerms.length > 0) {
    const invalid = resolvedPerms.filter(k => !(k in PERMISSIONS));
    if (invalid.length > 0) {
      return sendError(res, `Invalid permission keys: ${invalid.join(', ')}`);
    }
  }

  const role = await Role.create({
    name,
    displayName,
    description,
    permissions: resolvedPerms,
    createdBy: req.user._id,
  });

  sendSuccess(res, role, 'Role created', 201);
});

// GET /api/roles/:id — get role detail with assigned users
router.get('/:id', requirePermission('roles.manage'), async (req, res) => {
  const role = await Role.findById(req.params.id)
    .populate('createdBy', 'name')
    .populate('updatedBy', 'name');

  if (!role) return sendError(res, 'Role not found', 404);

  const users = await User.find({ roleId: role._id })
    .select('name email isActive lastLogin createdAt')
    .sort({ name: 1 })
    .lean();

  sendSuccess(res, { ...role.toObject(), users });
});

// PUT /api/roles/:id — update role
router.put('/:id', requirePermission('roles.manage'), async (req, res) => {
  const role = await Role.findById(req.params.id);
  if (!role) return sendError(res, 'Role not found', 404);

  const { name, displayName, description, permissions } = req.body;

  // Cannot change name of system roles
  if (role.isSystemRole && name && name !== role.name) {
    return sendError(res, 'Cannot change the name of a system role');
  }

  // Cannot change permissions of the admin system role
  if (role.isSystemRole && role.name === 'admin' && permissions) {
    return sendError(res, 'Cannot modify permissions of the admin system role. Admin always has all permissions.');
  }

  // Migrate legacy permission keys and validate
  if (permissions) {
    const resolvedPerms = migrateLegacyKeys(permissions);
    const invalid = resolvedPerms.filter(k => !(k in PERMISSIONS));
    if (invalid.length > 0) {
      return sendError(res, `Invalid permission keys: ${invalid.join(', ')}`);
    }
    role.permissions = resolvedPerms;
  }

  if (displayName) role.displayName = displayName;
  if (description !== undefined) role.description = description;
  if (name && !role.isSystemRole) role.name = name;
  role.updatedBy = req.user._id;

  await role.save();
  sendSuccess(res, role, 'Role updated');
});

// DELETE /api/roles/:id — delete role
router.delete('/:id', requirePermission('roles.manage'), async (req, res) => {
  const role = await Role.findById(req.params.id);
  if (!role) return sendError(res, 'Role not found', 404);

  if (role.isSystemRole) {
    return sendError(res, 'System roles cannot be deleted');
  }

  // Check if any users have this role
  const userCount = await User.countDocuments({ roleId: role._id });
  if (userCount > 0) {
    return sendError(
      res,
      `Cannot delete role "${role.displayName}" — ${userCount} user(s) are assigned to it. Reassign them first.`
    );
  }

  await Role.findByIdAndDelete(role._id);
  sendSuccess(res, null, 'Role deleted');
});

// POST /api/roles/:id/duplicate — duplicate a role
router.post('/:id/duplicate', requirePermission('roles.manage'), async (req, res) => {
  const source = await Role.findById(req.params.id);
  if (!source) return sendError(res, 'Source role not found', 404);

  const { newName, newDisplayName } = req.body;
  if (!newName || !newDisplayName) {
    return sendError(res, 'newName and newDisplayName are required');
  }

  const slugRegex = /^[a-z][a-z0-9_]*$/;
  if (!slugRegex.test(newName)) {
    return sendError(res, 'newName must be lowercase alphanumeric with underscores, starting with a letter');
  }

  const existing = await Role.findOne({ name: newName });
  if (existing) {
    return sendError(res, `Role "${newName}" already exists`, 409);
  }

  const duplicate = await Role.create({
    name: newName,
    displayName: newDisplayName,
    description: `Duplicated from ${source.displayName}`,
    permissions: [...source.permissions],
    isSystemRole: false,
    createdBy: req.user._id,
  });

  sendSuccess(res, duplicate, 'Role duplicated', 201);
});

module.exports = router;
