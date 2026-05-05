const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { protect } = require('../../middleware/auth');
const authService = require('./auth.service');
const { getModel } = require('../../config/modelRegistry');
const bcrypt = require('bcryptjs');
const logger = require('../../utils/logger');
const { sendSuccess, sendError } = require('../../utils/responseHelper');
const validate = require('../../middleware/validate');
const { loginValidation, registerValidation, changePasswordValidation } = require('./auth.validators');
const { sendPasswordResetEmail, isEmailConfigured } = require('../../utils/email');
const {
  buildResetPasswordUrl,
  generateResetToken,
  hashResetToken,
  PASSWORD_RESET_TTL_MS,
} = require('./passwordReset.helpers');

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

  const { token, user } = await authService.register(req, req.body);
  sendSuccess(res, { token, user }, 201);
});

// POST /api/auth/login
router.post('/login', loginLimiter, validate(loginValidation), async (req, res) => {
  const { email, password } = req.body;
  const writeAuditSafe = async (payload) => {
    try {
      const AuditLog = getModel(req, 'AuditLog');
      await AuditLog.create({ ...payload, ip: req.ip, userAgent: req.get('user-agent') });
    } catch (_) { /* auditing must never break auth */ }
  };

  try {
    const { token, user } = await authService.login(req, email, password);
    const authData = await authService.buildAuthResponse(req, user);

    await writeAuditSafe({
      userId: user._id,
      userName: user.name,
      userEmail: user.email,
      userRole: authData.user?.roleId?.displayName || authData.user?.roleId?.name || null,
      method: 'POST',
      path: '/api/auth/login',
      statusCode: 200,
      action: 'auth.login',
      entityType: 'auth',
      description: `Logged in as ${user.email}`,
    });

    sendSuccess(res, { token, ...authData });
  } catch (err) {
    // Best-effort lookup so the activity log still shows who attempted to log in
    let attemptedUser = null;
    try {
      const User = getModel(req, 'User');
      attemptedUser = await User.findOne({ email: (email || '').toLowerCase() })
        .populate('roleId', 'name displayName')
        .select('_id name email roleId')
        .lean();
    } catch (_) { /* non-fatal — fall through with just the email */ }

    await writeAuditSafe({
      userId: attemptedUser?._id,
      userName: attemptedUser?.name,
      userEmail: attemptedUser?.email || email,
      userRole: attemptedUser?.roleId?.displayName || attemptedUser?.roleId?.name || null,
      method: 'POST',
      path: '/api/auth/login',
      statusCode: err.statusCode || 401,
      action: 'auth.login_failed',
      entityType: 'auth',
      description: `Failed login for ${email}: ${err.message}`,
    });

    res.status(err.statusCode || 400).json({
      success: false,
      message: err.message,
      code:    err.code || 'LOGIN_FAILED',
    });
  }
});

// POST /api/auth/logout — client-driven, but still worth auditing for session tracking
router.post('/logout', protect, async (req, res) => {
  try {
    const AuditLog = getModel(req, 'AuditLog');
    await AuditLog.create({
      userId: req.user._id,
      userName: req.user.name,
      userEmail: req.user.email,
      userRole: req.user.roleId?.displayName || req.user.roleId?.name,
      method: 'POST',
      path: '/api/auth/logout',
      statusCode: 200,
      action: 'auth.logout',
      entityType: 'auth',
      description: `Logged out ${req.user.email}`,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
  } catch (_) {}
  sendSuccess(res, { message: 'Logged out' });
});

// GET /api/auth/me
router.get('/me', protect, async (req, res) => {
  const User = getModel(req, 'User');
  const user = await User.findById(req.user.id).populate('roleId');
  if (!user) return sendError(res, 'User not found', 404);
  const authData = await authService.buildAuthResponse(req, user);
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
    const actorRole = req.user.roleId?.displayName || req.user.roleId?.name || null;
    const baseAudit = {
      model: 'User',
      documentId: user._id,
      userId: req.user._id,
      userName: req.user.name,
      userEmail: req.user.email,
      userRole: actorRole,
      action: 'profile_update',
      entityType: 'users',
      entityId: String(user._id),
    };
    if (oldName !== user.name) {
      await AuditLog.create({ ...baseAudit, field: 'name', oldValue: oldName, newValue: user.name, description: `Updated own name: ${oldName} → ${user.name}` });
    }
    if (oldEmail !== user.email) {
      await AuditLog.create({ ...baseAudit, field: 'email', oldValue: oldEmail, newValue: user.email, description: `Updated own email: ${oldEmail} → ${user.email}` });
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

// Rate limit on forgot/reset endpoints: 5 per 15 minutes per IP
const passwordResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { success: false, message: 'Too many password reset requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// POST /api/auth/forgot-password — request a reset email (public)
// Always responds 200 to avoid leaking whether an email is registered.
router.post('/forgot-password', passwordResetLimiter, async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();

  const genericResponse = () => sendSuccess(res, {
    message: 'If an account exists for that email, a reset link has been sent.',
  });

  if (!email) return genericResponse();

  if (!isEmailConfigured()) {
    logger.warn('forgot-password called but SMTP is not configured');
    // Don't expose configuration state to anonymous callers — respond generically.
    return genericResponse();
  }

  const User = getModel(req, 'User');
  const user = await User.findOne({ email });
  if (!user || !user.isActive) {
    // Don't reveal whether the email exists or is active
    return genericResponse();
  }

  const { token, tokenHash } = generateResetToken();
  user.passwordResetTokenHash = tokenHash;
  user.passwordResetExpires = new Date(Date.now() + PASSWORD_RESET_TTL_MS);
  await user.save({ validateBeforeSave: false });

  const resetUrl = buildResetPasswordUrl(req, token);
  try {
    await sendPasswordResetEmail({
      to: user.email,
      name: user.name,
      resetUrl,
      tenantName: req.tenant?.name,
      expiresMinutes: Math.floor(PASSWORD_RESET_TTL_MS / 60000),
    });
  } catch (err) {
    logger.error('Failed to send password reset email', {
      to: user.email,
      error: err.message,
    });
    // Roll back so a failed send doesn't leave a live token in the DB
    user.passwordResetTokenHash = null;
    user.passwordResetExpires = null;
    await user.save({ validateBeforeSave: false });
  }

  return genericResponse();
});

// GET /api/auth/reset-password/:token — verify a reset token (public)
router.get('/reset-password/:token', passwordResetLimiter, async (req, res) => {
  const { token } = req.params;
  if (!token || token.length < 32) return sendError(res, 'Invalid reset token', 400);

  const User = getModel(req, 'User');
  const user = await User.findOne({
    passwordResetTokenHash: hashResetToken(token),
    passwordResetExpires: { $gt: new Date() },
  }).select('email name passwordResetExpires');

  if (!user) return sendError(res, 'This reset link is invalid or has expired', 400);

  return sendSuccess(res, {
    email: user.email,
    name: user.name,
    expiresAt: user.passwordResetExpires,
  });
});

// POST /api/auth/reset-password — set a new password using a token (public)
router.post('/reset-password', passwordResetLimiter, async (req, res) => {
  const { token, password } = req.body || {};
  if (!token) return sendError(res, 'Reset token is required', 400);
  if (!password || password.length < 8) {
    return sendError(res, 'New password must be at least 8 characters', 400);
  }

  const User = getModel(req, 'User');
  const user = await User.findOne({
    passwordResetTokenHash: hashResetToken(token),
    passwordResetExpires: { $gt: new Date() },
  }).select('+password +passwordResetTokenHash +passwordResetExpires email name');

  if (!user) return sendError(res, 'This reset link is invalid or has expired', 400);

  // Reject reusing the same password
  const isSame = await bcrypt.compare(password, user.password);
  if (isSame) return sendError(res, 'New password must be different from your current password', 400);

  user.password = password; // pre-save hook hashes
  user.passwordResetTokenHash = null;
  user.passwordResetExpires = null;
  await user.save();

  return sendSuccess(res, { email: user.email }, 'Password has been reset. You can now log in.');
});

module.exports = router;
