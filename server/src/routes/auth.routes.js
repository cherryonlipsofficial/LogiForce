const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { protect } = require('../middleware/auth');
const authService = require('../services/auth.service');
const { getModel } = require('../config/modelRegistry');
const bcrypt = require('bcryptjs');
const { sendSuccess, sendError } = require('../utils/responseHelper');
const validate = require('../middleware/validate');
const { loginValidation, registerValidation, changePasswordValidation } = require('../middleware/validators/auth.validators');

// Rate limit on login: 5 requests per minute
const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { success: false, message: 'Too many login attempts. Please try again after 1 minute.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// POST /api/auth/register — admin only in production
router.post('/register', validate(registerValidation), async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    // In production, only admins can register new users
    try {
      await new Promise((resolve, reject) => {
        protect(req, res, (err) => (err ? reject(err) : resolve()));
      });
      if (!req.user.roleId?.isSystemRole) {
        return sendError(res, 'Only admins can register users', 403);
      }
    } catch {
      return sendError(res, 'Authentication required', 401);
    }
  }

  const { token, user } = await authService.register(req.body);
  sendSuccess(res, { token, user }, 201);
});

// POST /api/auth/login
router.post('/login', loginLimiter, validate(loginValidation), async (req, res) => {
  try {
    const { email, password } = req.body;
    const { token, user } = await authService.login(email, password);
    const authData = await authService.buildAuthResponse(user);
    sendSuccess(res, { token, ...authData });
  } catch (err) {
    res.status(err.statusCode || 400).json({
      success: false,
      message: err.message,
      code:    err.code || 'LOGIN_FAILED',
    });
  }
});

// GET /api/auth/me
router.get('/me', protect, async (req, res) => {
  const User = getModel(req, 'User');
  const user = await User.findById(req.user.id).populate('roleId');
  if (!user) return sendError(res, 'User not found', 404);
  const authData = await authService.buildAuthResponse(user);
  sendSuccess(res, authData);
});

// PUT /api/auth/change-password
router.put('/change-password', protect, validate(changePasswordValidation), async (req, res) => {
  const { currentPassword, newPassword, confirmPassword } = req.body;

  if (confirmPassword && newPassword !== confirmPassword) {
    return sendError(res, 'Passwords do not match');
  }
  if (newPassword && newPassword.length < 8) {
    return sendError(res, 'New password must be at least 8 characters');
  }

  const User = getModel(req, 'User');
  const user = await User.findById(req.user.id).select('+password');
  if (!(await user.comparePassword(currentPassword))) {
    return sendError(res, 'Current password is incorrect');
  }

  const isSame = await bcrypt.compare(newPassword, user.password);
  if (isSame) {
    return sendError(res, 'New password must be different from current password');
  }

  user.password = newPassword;
  await user.save();
  sendSuccess(res, { success: true, message: 'Password changed successfully' });
});

// GET /api/auth/permissions — current user's effective permission set (for frontend AuthContext)
router.get('/permissions', protect, async (req, res) => {
  const User = getModel(req, 'User');
  const user = await User.findById(req.user.id)
    .populate('roleId', 'name displayName permissions isSystemRole');
  if (!user) return sendError(res, 'User not found', 404);

  const effectivePermissions = await user.getPermissions();

  sendSuccess(res, {
    role: {
      _id: user.roleId?._id,
      name: user.roleId?.name,
      displayName: user.roleId?.displayName,
      isSystemRole: user.roleId?.isSystemRole,
    },
    permissions: effectivePermissions,
  });
});

// GET /api/auth/profile — full profile for current user
router.get('/profile', protect, async (req, res) => {
  const User = getModel(req, 'User');
  const user = await User.findById(req.user._id)
    .populate('roleId', 'name displayName description permissions')
    .populate('activatedBy', 'name')
    .select('-password');
  if (!user) return sendError(res, 'User not found', 404);

  const effectivePermissions = await user.getPermissions();

  sendSuccess(res, {
    user: {
      _id: user._id,
      name: user.name,
      email: user.email,
      isActive: user.isActive,
      lastLogin: user.lastLogin,
      activatedAt: user.activatedAt,
      activatedBy: user.activatedBy,
      createdAt: user.createdAt,
      preferences: user.preferences,
      roleId: user.roleId ? {
        name: user.roleId.name,
        displayName: user.roleId.displayName,
        description: user.roleId.description,
      } : null,
      permissionOverrides: user.permissionOverrides,
    },
    permissionCount: effectivePermissions.length,
    effectivePermissions,
  });
});

// PUT /api/auth/profile — update own name and email
router.put('/profile', protect, async (req, res) => {
  const { name, email } = req.body;

  // Validate
  if (!name || typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 80) {
    return sendError(res, 'Name must be between 2 and 80 characters');
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email)) {
    return sendError(res, 'A valid email is required');
  }

  const User = getModel(req, 'User');
  const AuditLog = getModel(req, 'AuditLog');

  // Check email uniqueness
  const existing = await User.findOne({ email: email.toLowerCase(), _id: { $ne: req.user._id } }).lean();
  if (existing) {
    return sendError(res, 'Email is already in use by another account');
  }

  const user = await User.findById(req.user._id);
  if (!user) return sendError(res, 'User not found', 404);

  const oldName = user.name;
  const oldEmail = user.email;

  user.name = name.trim();
  user.email = email.toLowerCase().trim();
  await user.save();

  // Audit log
  try {
    if (oldName !== user.name) {
      await AuditLog.create({ model: 'User', documentId: user._id, field: 'name', oldValue: oldName, newValue: user.name, userId: req.user._id, action: 'profile_update' });
    }
    if (oldEmail !== user.email) {
      await AuditLog.create({ model: 'User', documentId: user._id, field: 'email', oldValue: oldEmail, newValue: user.email, userId: req.user._id, action: 'profile_update' });
    }
  } catch (_) { /* audit log failure should not block response */ }

  const updated = await User.findById(user._id).populate('roleId', 'name displayName description').select('-password').lean();
  sendSuccess(res, { user: updated });
});

// PUT /api/auth/profile/avatar — update display preferences
router.put('/profile/avatar', protect, async (req, res) => {
  const { preferredInitialsColor } = req.body;
  const validColors = ['blue', 'teal', 'purple', 'amber', 'coral', 'pink'];

  if (!preferredInitialsColor || !validColors.includes(preferredInitialsColor)) {
    return sendError(res, 'Invalid color. Must be one of: ' + validColors.join(', '));
  }

  const User = getModel(req, 'User');
  const user = await User.findById(req.user._id);
  if (!user) return sendError(res, 'User not found', 404);

  if (!user.preferences) user.preferences = {};
  user.preferences.initialsColor = preferredInitialsColor;
  await user.save();

  const updated = await User.findById(user._id).select('-password').lean();
  sendSuccess(res, { user: updated });
});

module.exports = router;
