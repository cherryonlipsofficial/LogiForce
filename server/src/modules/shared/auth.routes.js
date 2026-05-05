const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { protect } = require('../../middleware/auth');
const authService = require('./auth.service');
const { getModel } = require('../../config/modelRegistry');
const bcrypt = require('bcryptjs');
const { sendSuccess, sendError } = require('../../utils/responseHelper');
const validate = require('../../middleware/validate');
const logger = require('../../utils/logger');
const {
  loginValidation,
  registerValidation,
  changePasswordValidation,
  forgotPasswordValidation,
  resetPasswordValidation,
} = require('./auth.validators');

// Rate limit on login: 5 requests per minute
const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { success: false, message: 'Too many login attempts. Please try again after 1 minute.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limit on forgot-password: 5 per hour per IP — prevents enumeration & spam
const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { success: false, message: 'Too many password reset requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limit on reset-password: 10 per hour per IP — prevents brute-forcing the token
const resetPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { success: false, message: 'Too many reset attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const buildResetUrl = (req, token) => {
  const fromHeader = req.get('origin') || req.get('referer');
  const base =
    process.env.CLIENT_RESET_PASSWORD_URL ||
    (fromHeader ? fromHeader.replace(/\/+$/, '') : null) ||
    process.env.CLIENT_URL?.split(',')[0] ||
    '';
  if (!base) return `/reset-password?token=${token}`;
  return `${base.replace(/\/+$/, '')}/reset-password?token=${token}`;
};

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

// POST /api/auth/forgot-password — request a password reset link
router.post(
  '/forgot-password',
  forgotPasswordLimiter,
  validate(forgotPasswordValidation),
  async (req, res) => {
    const { email } = req.body;
    const genericMessage =
      'If an account exists for that email, a password reset link has been sent.';

    try {
      const result = await authService.requestPasswordReset(req, email);

      if (result.delivered) {
        const resetUrl = buildResetUrl(req, result.token);

        // Audit log — record that a reset was requested (does not include the token)
        try {
          const AuditLog = getModel(req, 'AuditLog');
          await AuditLog.create({
            userId: result.user._id,
            userName: result.user.name,
            userEmail: result.user.email,
            method: 'POST',
            path: '/api/auth/forgot-password',
            statusCode: 200,
            action: 'auth.password_reset_requested',
            entityType: 'auth',
            description: `Password reset requested for ${result.user.email}`,
            ip: req.ip,
            userAgent: req.get('user-agent'),
          });
        } catch (_) { /* non-fatal */ }

        // No email service is wired up in this repo — surface the link via logs
        // so an operator can deliver it. In production, swap this for a mailer.
        logger.info(
          `[auth] Password reset link for ${result.user.email}: ${resetUrl} (expires ${result.expiresAt.toISOString()})`
        );

        // In non-production environments, return the reset URL directly so
        // developers and tests can complete the flow without an email service.
        if (process.env.NODE_ENV !== 'production') {
          return sendSuccess(res, {
            message: genericMessage,
            devResetUrl: resetUrl,
            devToken: result.token,
            expiresAt: result.expiresAt,
          });
        }
      }

      return sendSuccess(res, { message: genericMessage });
    } catch (err) {
      // Never leak details — always respond with the same generic message
      logger.error('Forgot password error', { error: err.message });
      return sendSuccess(res, { message: genericMessage });
    }
  }
);

// POST /api/auth/reset-password — consume a reset token and set a new password
router.post(
  '/reset-password',
  resetPasswordLimiter,
  validate(resetPasswordValidation),
  async (req, res) => {
    const { token, newPassword } = req.body;

    try {
      const user = await authService.resetPassword(req, token, newPassword);

      try {
        const AuditLog = getModel(req, 'AuditLog');
        await AuditLog.create({
          userId: user._id,
          userName: user.name,
          userEmail: user.email,
          method: 'POST',
          path: '/api/auth/reset-password',
          statusCode: 200,
          action: 'auth.password_reset_completed',
          entityType: 'auth',
          description: `Password reset completed for ${user.email}`,
          ip: req.ip,
          userAgent: req.get('user-agent'),
        });
      } catch (_) { /* non-fatal */ }

      return sendSuccess(res, {
        message: 'Your password has been reset. You can now sign in with your new password.',
      });
    } catch (err) {
      return sendError(res, err.message || 'Reset failed', err.statusCode || 400);
    }
  }
);

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

module.exports = router;
