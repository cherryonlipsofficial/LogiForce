const express = require('express');
const router = express.Router();
const { protect, requirePermission } = require('../../middleware/auth');
const { getModel } = require('../../config/modelRegistry');
const { PERMISSIONS } = require('../../config/permissions');
const {
  httpError,
  assertCanAssignRole,
  assertCanChangeAccessOf,
  assertCanOverrideKey,
  assertSeatAvailable,
  grantablePermissionKeys,
} = require('../../utils/accessGuards');
const { sendSuccess, sendError, sendPaginated } = require('../../utils/responseHelper');
const { PAGINATION } = require('../../config/constants');
const logger = require('../../utils/logger');
const { sendPasswordResetEmail, isEmailConfigured } = require('../../utils/email');
const {
  buildResetPasswordUrl,
  generateResetToken,
  PASSWORD_RESET_TTL_MS,
} = require('./passwordReset.helpers');

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

  // Validate roleId exists and the caller may hand it out
  const role = await Role.findById(roleId);
  if (!role) return sendError(res, 'Role not found', 404);
  assertCanAssignRole(req, role);

  // Check email uniqueness
  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) return sendError(res, 'A user with this email already exists', 409);

  // Created inactive, so it takes no seat until /:id/activate.
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

// GET /api/users/grantable-permissions — what the caller may grant someone
// through an override: within the company's limit (enabled modules) and held
// by the caller. Same rule as assertCanOverrideKey, which rejects anything
// else. Must stay above /:id.
router.get('/grantable-permissions', requirePermission('users.manage_access'), async (req, res) => {
  const keys = grantablePermissionKeys(req);
  const permissions = keys.map((key) => {
    const { label, module, description } = PERMISSIONS[key];
    return { key, label, module, description };
  });
  sendSuccess(res, { keys, permissions });
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
  await assertSeatAvailable(req, User);

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

// POST /api/users/:id/reset-password — admin triggers a password reset email
router.post('/:id/reset-password', requirePermission('users.edit'), async (req, res) => {
  if (!isEmailConfigured()) {
    return sendError(
      res,
      'Email service is not configured on the server. Set RESEND_API_KEY to enable password reset emails.',
      503,
    );
  }

  const User = getModel(req, 'User');
  const user = await User.findById(req.params.id);
  if (!user) return sendError(res, 'User not found', 404);

  const { token, tokenHash } = generateResetToken();
  user.passwordResetTokenHash = tokenHash;
  user.passwordResetExpires = new Date(Date.now() + PASSWORD_RESET_TTL_MS);
  await user.save({ validateBeforeSave: false });

  const resetUrl = buildResetPasswordUrl(req, token);
  const expiresMinutes = Math.floor(PASSWORD_RESET_TTL_MS / 60000);

  try {
    await sendPasswordResetEmail({
      to: user.email,
      name: user.name,
      resetUrl,
      tenantName: req.tenant?.name,
      expiresMinutes,
    });
  } catch (err) {
    logger.error('Failed to send password reset email', {
      to: user.email,
      error: err.message,
      stack: err.stack,
    });
    // Roll back the token so the failed request doesn't leave a live token behind
    user.passwordResetTokenHash = null;
    user.passwordResetExpires = null;
    await user.save({ validateBeforeSave: false });
    return sendError(res, `Could not send password reset email: ${err.message}`, 502);
  }

  return sendSuccess(res, { email: user.email }, `Password reset email sent to ${user.email}`);
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
    .populate('roleId', 'name displayName permissions templateKey')
    .populate('permissionOverrides.grantedBy', 'name');

  if (!user) return sendError(res, 'User not found', 404);

  sendSuccess(res, user.toJSON());
});

// PUT /api/users/:id — update user fields
router.put('/:id', requirePermission('users.edit'), async (req, res) => {
  const User = getModel(req, 'User');
  const Role = getModel(req, 'Role');
  const user = await User.findById(req.params.id).populate('roleId', User.ROLE_ACCESS_FIELDS);
  if (!user) return sendError(res, 'User not found', 404);

  const { name, email, roleId, isActive } = req.body;
  const isSelf = req.user._id.toString() === req.params.id;

  // Cannot deactivate own account
  if (isSelf && isActive === false) {
    return sendError(res, 'Cannot deactivate your own account');
  }

  // A role change is an access change: same checks as PUT /:id/role.
  const roleChanges = roleId && String(roleId) !== String(user.roleId?._id ?? user.roleId);
  if (roleChanges) {
    if (!req.userPermissions.includes('users.manage_access')) {
      throw httpError(403, 'Access denied. Required permission: users.manage_access');
    }
    assertCanChangeAccessOf(req, user);
    const role = await Role.findById(roleId);
    if (!role) return sendError(res, 'Role not found', 404);
    assertCanAssignRole(req, role);
  }

  // Inactive → active takes a seat
  if (isActive === true && !user.isActive) await assertSeatAvailable(req, User);

  if (roleChanges) user.roleId = roleId;
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
router.put('/:id/role', requirePermission('users.manage_access'), async (req, res) => {
  const User = getModel(req, 'User');
  const Role = getModel(req, 'Role');

  const { roleId } = req.body;
  if (!roleId) return sendError(res, 'roleId is required');

  const user = await User.findById(req.params.id).populate('roleId', User.ROLE_ACCESS_FIELDS);
  if (!user) return sendError(res, 'User not found', 404);
  assertCanChangeAccessOf(req, user);

  const role = await Role.findById(roleId);
  if (!role) return sendError(res, 'Role not found', 404);
  assertCanAssignRole(req, role);

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
    .populate('roleId', User.ROLE_ACCESS_FIELDS)
    .populate('permissionOverrides.grantedBy', 'name');

  if (!user) return sendError(res, 'User not found', 404);

  const rolePermissions = user.roleId?.permissions || [];
  const overrides = user.permissionOverrides || [];
  const effectivePermissions = await user.getPermissions(req.tenant);

  sendSuccess(res, {
    rolePermissions,
    overrides,
    effectivePermissions,
  });
});

// POST /api/users/:id/permissions/override — add or update a permission override
router.post('/:id/permissions/override', requirePermission('users.manage_access'), async (req, res) => {
  const User = getModel(req, 'User');
  const { key, granted, reason } = req.body;

  if (!key || granted === undefined) {
    return sendError(res, 'key and granted are required');
  }

  // Validate permission key
  if (!(key in PERMISSIONS)) {
    return sendError(res, `"${key}" is not a valid permission key`);
  }

  // Only keys within the company's ceiling, and only grants the caller holds
  assertCanOverrideKey(req, key, Boolean(granted));

  const user = await User.findById(req.params.id).populate('roleId', User.ROLE_ACCESS_FIELDS);
  if (!user) return sendError(res, 'User not found', 404);
  assertCanChangeAccessOf(req, user);

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
  await user.populate('permissionOverrides.grantedBy', 'name');
  const effectivePermissions = await user.getPermissions(req.tenant);

  sendSuccess(res, {
    rolePermissions: user.roleId?.permissions || [],
    overrides: user.permissionOverrides,
    effectivePermissions,
  }, 'Permission override saved');
});

// DELETE /api/users/:id/permissions/override/:key — remove a permission override
router.delete('/:id/permissions/override/:key', requirePermission('users.manage_access'), async (req, res) => {
  const User = getModel(req, 'User');
  const { key } = req.params;

  const user = await User.findById(req.params.id).populate('roleId', User.ROLE_ACCESS_FIELDS);
  if (!user) return sendError(res, 'User not found', 404);
  assertCanChangeAccessOf(req, user);

  // Removing a deny override hands the key back, so it counts as a grant.
  const existing = user.permissionOverrides.find((o) => o.key === key);
  assertCanOverrideKey(req, key, existing ? existing.granted === false : false);

  const beforeLen = user.permissionOverrides.length;
  user.permissionOverrides = user.permissionOverrides.filter(o => o.key !== key);

  if (user.permissionOverrides.length === beforeLen) {
    return sendError(res, `No override found for key "${key}"`, 404);
  }

  await user.save();

  // Return updated permissions
  const effectivePermissions = await user.getPermissions(req.tenant);

  sendSuccess(res, {
    rolePermissions: user.roleId?.permissions || [],
    overrides: user.permissionOverrides,
    effectivePermissions,
  }, 'Permission override removed');
});

module.exports = router;
