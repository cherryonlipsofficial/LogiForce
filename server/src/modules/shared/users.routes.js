const express = require('express');
const router = express.Router();
const { protect, requirePermission } = require('../../middleware/auth');
const { getModel } = require('../../config/modelRegistry');
const { PERMISSIONS } = require('../../config/permissions');
const { sendSuccess, sendError, sendPaginated } = require('../../utils/responseHelper');
const { PAGINATION } = require('../../config/constants');
const logger = require('../../utils/logger');

// All routes require authentication
router.use(protect);

// ─── User CRUD ──────────────────────────────────────────────────────────────

// GET /api/users — list all users
router.get('/', requirePermission('users.view'), async (req, res) => {
  const User = getModel(req, 'User');
  const page = parseInt(req.query.page) || PAGINATION.DEFAULT_PAGE;
  const limit = parseInt(req.query.limit) || PAGINATION.DEFAULT_LIMIT;
  const skip = (page - 1) * limit;

  const query = {};
  if (req.query.search) {
    query.$or = [
      { name: { $regex: req.query.search, $options: 'i' } },
      { email: { $regex: req.query.search, $options: 'i' } },
    ];
  }
  if (req.query.roleId) query.roleId = req.query.roleId;
  if (req.query.isActive !== undefined) query.isActive = req.query.isActive === 'true';

  const [users, total] = await Promise.all([
    User.find(query)
      .select('name email roleId isActive lastLogin createdAt activatedAt activatedBy')
      .populate('roleId', 'name displayName')
      .sort({ name: 1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    User.countDocuments(query),
  ]);

  sendPaginated(res, users, total, page, limit);
});

// POST /api/users — create a new user
router.post('/', requirePermission('users.create'), async (req, res) => {
  const User = getModel(req, 'User');
  const Role = getModel(req, 'Role');
  const { name, email, password, roleId } = req.body;

  if (!name || !email || !password || !roleId) {
    return sendError(res, 'name, email, password, and roleId are required');
  }

  // Validate roleId exists
  const role = await Role.findById(roleId);
  if (!role) return sendError(res, 'Role not found', 404);

  // Check email uniqueness
  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) return sendError(res, 'A user with this email already exists', 409);

  const user = await User.create({
    name,
    email,
    password,
    roleId,
    isActive: false,
    permissionOverrides: [],
  });
  await user.populate('roleId', 'name displayName');

  logger.info('New user created (inactive)', { email: user.email, createdBy: req.user.email });

  sendSuccess(res, user.toJSON(), 'User created', 201);
});

// GET /api/users/inactive — list all inactive users
router.get('/inactive', requirePermission('users.view'), async (req, res) => {
  const User = getModel(req, 'User');
  const users = await User.find({ isActive: false })
    .populate('roleId', 'name displayName')
    .select('-password')
    .sort({ createdAt: -1 })
    .lean();

  res.json({ success: true, data: users, count: users.length });
});

// PUT /api/users/:id/activate — admin activates a user account
router.put('/:id/activate', requirePermission('users.edit'), async (req, res) => {
  const User = getModel(req, 'User');
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ message: 'User not found' });
  if (user.isActive) return res.status(400).json({ message: 'User is already active' });

  user.isActive = true;
  user.activatedBy = req.user._id;
  user.activatedAt = new Date();
  await user.save();

  return res.json({
    success: true,
    message: `${user.name}'s account has been activated`,
    data: { _id: user._id, name: user.name, email: user.email, isActive: true },
  });
});

// PUT /api/users/:id/deactivate — admin deactivates a user account
router.put('/:id/deactivate', requirePermission('users.edit'), async (req, res) => {
  const User = getModel(req, 'User');
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ message: 'User not found' });

  if (user._id.toString() === req.user._id.toString()) {
    return res.status(400).json({ message: 'You cannot deactivate your own account' });
  }

  user.isActive = false;
  await user.save();

  return res.json({
    success: true,
    message: `${user.name}'s account has been deactivated`,
    data: { _id: user._id, name: user.name, email: user.email, isActive: false },
  });
});

// GET /api/users/:id — get user detail with role and overrides
router.get('/:id', requirePermission('users.view'), async (req, res) => {
  const User = getModel(req, 'User');
  const user = await User.findById(req.params.id)
    .populate('roleId', 'name displayName permissions isSystemRole')
    .populate('permissionOverrides.grantedBy', 'name');

  if (!user) return sendError(res, 'User not found', 404);

  sendSuccess(res, user.toJSON());
});

// PUT /api/users/:id — update user fields
router.put('/:id', requirePermission('users.edit'), async (req, res) => {
  const User = getModel(req, 'User');
  const Role = getModel(req, 'Role');
  const user = await User.findById(req.params.id);
  if (!user) return sendError(res, 'User not found', 404);

  const { name, email, roleId, isActive } = req.body;
  const isSelf = req.user._id.toString() === req.params.id;

  // Cannot change own roleId (prevent self-lockout)
  if (isSelf && roleId && roleId !== user.roleId.toString()) {
    return sendError(res, 'Cannot change your own role');
  }

  // Cannot deactivate own account
  if (isSelf && isActive === false) {
    return sendError(res, 'Cannot deactivate your own account');
  }

  // Validate roleId if provided
  if (roleId) {
    const role = await Role.findById(roleId);
    if (!role) return sendError(res, 'Role not found', 404);
    user.roleId = roleId;
  }

  if (name) user.name = name;
  if (email) user.email = email;
  if (isActive !== undefined) user.isActive = isActive;

  await user.save();
  await user.populate('roleId', 'name displayName');

  sendSuccess(res, user.toJSON(), 'User updated');
});

// DELETE /api/users/:id — soft delete (set isActive = false)
router.delete('/:id', requirePermission('users.delete'), async (req, res) => {
  const User = getModel(req, 'User');
  if (req.user._id.toString() === req.params.id) {
    return sendError(res, 'Cannot delete your own account');
  }

  const user = await User.findById(req.params.id);
  if (!user) return sendError(res, 'User not found', 404);

  user.isActive = false;
  await user.save();

  sendSuccess(res, null, 'User deactivated');
});

// ─── Role assignment ────────────────────────────────────────────────────────

// PUT /api/users/:id/role — change a user's role
router.put('/:id/role', requirePermission('users.edit'), async (req, res) => {
  const User = getModel(req, 'User');
  const Role = getModel(req, 'Role');
  if (req.user._id.toString() === req.params.id) {
    return sendError(res, 'Cannot change your own role');
  }

  const { roleId } = req.body;
  if (!roleId) return sendError(res, 'roleId is required');

  const role = await Role.findById(roleId);
  if (!role) return sendError(res, 'Role not found', 404);

  const user = await User.findById(req.params.id);
  if (!user) return sendError(res, 'User not found', 404);

  user.roleId = roleId;
  await user.save();
  await user.populate('roleId', 'name displayName');

  sendSuccess(res, user.toJSON(), 'User role updated');
});

// ─── Permission overrides ───────────────────────────────────────────────────

// GET /api/users/:id/permissions — get user's effective permissions
router.get('/:id/permissions', requirePermission('users.view'), async (req, res) => {
  const User = getModel(req, 'User');
  const user = await User.findById(req.params.id)
    .populate('roleId', 'name displayName permissions')
    .populate('permissionOverrides.grantedBy', 'name');

  if (!user) return sendError(res, 'User not found', 404);

  const rolePermissions = user.roleId?.permissions || [];
  const overrides = user.permissionOverrides || [];
  const effectivePermissions = await user.getPermissions();

  sendSuccess(res, {
    rolePermissions,
    overrides,
    effectivePermissions,
  });
});

// POST /api/users/:id/permissions/override — add or update a permission override
router.post('/:id/permissions/override', requirePermission('roles.manage'), async (req, res) => {
  const User = getModel(req, 'User');
  const { key, granted, reason } = req.body;

  if (!key || granted === undefined) {
    return sendError(res, 'key and granted are required');
  }

  // Validate permission key
  if (!(key in PERMISSIONS)) {
    return sendError(res, `"${key}" is not a valid permission key`);
  }

  // Cannot override roles.manage (prevent privilege escalation)
  if (key === 'roles.manage') {
    return sendError(res, 'Cannot override the roles.manage permission');
  }

  const user = await User.findById(req.params.id);
  if (!user) return sendError(res, 'User not found', 404);

  // Upsert: find existing override for this key, or push new one
  const existingIdx = user.permissionOverrides.findIndex(o => o.key === key);
  const overrideData = {
    key,
    granted: Boolean(granted),
    reason: reason || '',
    grantedBy: req.user._id,
    grantedAt: new Date(),
  };

  if (existingIdx >= 0) {
    user.permissionOverrides[existingIdx] = overrideData;
  } else {
    user.permissionOverrides.push(overrideData);
  }

  await user.save();

  // Return updated permissions
  await user.populate('roleId', 'name displayName permissions');
  await user.populate('permissionOverrides.grantedBy', 'name');
  const effectivePermissions = await user.getPermissions();

  sendSuccess(res, {
    rolePermissions: user.roleId?.permissions || [],
    overrides: user.permissionOverrides,
    effectivePermissions,
  }, 'Permission override saved');
});

// DELETE /api/users/:id/permissions/override/:key — remove a permission override
router.delete('/:id/permissions/override/:key', requirePermission('roles.manage'), async (req, res) => {
  const User = getModel(req, 'User');
  const { key } = req.params;

  const user = await User.findById(req.params.id);
  if (!user) return sendError(res, 'User not found', 404);

  const beforeLen = user.permissionOverrides.length;
  user.permissionOverrides = user.permissionOverrides.filter(o => o.key !== key);

  if (user.permissionOverrides.length === beforeLen) {
    return sendError(res, `No override found for key "${key}"`, 404);
  }

  await user.save();

  // Return updated permissions
  await user.populate('roleId', 'name displayName permissions');
  const effectivePermissions = await user.getPermissions();

  sendSuccess(res, {
    rolePermissions: user.roleId?.permissions || [],
    overrides: user.permissionOverrides,
    effectivePermissions,
  }, 'Permission override removed');
});

module.exports = router;
