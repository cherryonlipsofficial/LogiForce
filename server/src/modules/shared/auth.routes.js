const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { protect, requirePermission } = require('../../middleware/auth');
const { assertCanAssignRole, assertSeatAvailable } = require('../../utils/accessGuards');
const authService = require('./auth.service');
const { getModel } = require('../../config/modelRegistry');
const bcrypt = require('bcryptjs');
const logger = require('../../utils/logger');
const { sendSuccess, sendError } = require('../../utils/responseHelper');
const validate = require('../../middleware/validate');
const { loginValidation, registerValidation, changePasswordValidation } = require('./auth.validators');
const { sendPasswordResetEmail, sendOtpEmail, isEmailConfigured } = require('../../utils/email');
const {
  buildResetPasswordUrl,
  generateResetToken,
  hashResetToken,
  generateEmailOtp,
  hashEmailOtp,
  PASSWORD_RESET_TTL_MS,
  EMAIL_OTP_TTL_MS,
  EMAIL_OTP_MAX_ATTEMPTS,
} = require('./passwordReset.helpers');

// Rate limit on login: 5 requests per minute
const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { success: false, message: 'Too many login attempts. Please try again after 1 minute.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// POST /api/auth/register — a signed-in user with users.create adds a user to
// their own company. The requested role goes through the same check as
// POST /api/users (assertCanAssignRole).
router.post('/register', protect, requirePermission('users.create'), validate(registerValidation), async (req, res) => {
  const Role = getModel(req, 'Role');
  const User = getModel(req, 'User');
  const { name, email, password, roleId, isActive } = req.body;
  const role = roleId ? await Role.findById(roleId).lean() : null;
  assertCanAssignRole(req, role);
  // Users start inactive (schema default) unless the body says otherwise; an
  // active user takes a seat.
  if (isActive === true) await assertSeatAvailable(req, User);

  // Only these fields: permissionOverrides and the like never come from the body.
  const userData = { name, email, password, roleId };
  if (typeof isActive === 'boolean') userData.isActive = isActive;
  const { token, user } = await authService.register(req, userData);
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
  const user = await User.findById(req.user.id).populate('roleId', User.ROLE_ACCESS_FIELDS);
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
    .populate('roleId', User.ROLE_ACCESS_FIELDS);
  if (!user) return sendError(res, 'User not found', 404);

  const effectivePermissions = await user.getPermissions(req.tenant);

  sendSuccess(res, {
    role: {
      _id: user.roleId?._id,
      name: user.roleId?.name,
      displayName: user.roleId?.displayName,
    },
    permissions: effectivePermissions,
  });
});

// GET /api/auth/profile — full profile for current user
router.get('/profile', protect, async (req, res) => {
  const User = getModel(req, 'User');
  const user = await User.findById(req.user._id)
    .populate('roleId', User.ROLE_ACCESS_FIELDS)
    .populate('activatedBy', 'name')
    .select('-password');
  if (!user) return sendError(res, 'User not found', 404);

  const effectivePermissions = await user.getPermissions(req.tenant);

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
    logger.warn('forgot-password called but no email provider is configured');
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

// ─── OTP-based flows ────────────────────────────────────────────────────────
// Email is delivered through Resend's HTTP API — set RESEND_API_KEY and the
// app sends mail. The shared "onboarding@resend.dev" sender only delivers to
// the account owner's email; to send to any other recipient verify a domain
// at resend.com/domains and set EMAIL_FROM. For local dev without a domain,
// set EMAIL_DEV_LOG=true to log emails (and OTP codes) to the server console.

// 5 OTP-related requests per 15 minutes per IP — covers send + verify + resend
const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, message: 'Too many OTP requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const issueAndSendOtp = async ({ user, purpose, tenantName }) => {
  const { code, codeHash } = generateEmailOtp();
  user.emailOtpHash = codeHash;
  user.emailOtpPurpose = purpose;
  user.emailOtpExpires = new Date(Date.now() + EMAIL_OTP_TTL_MS);
  user.emailOtpAttempts = 0;
  await user.save({ validateBeforeSave: false });

  try {
    await sendOtpEmail({
      to: user.email,
      name: user.name,
      code,
      purpose,
      tenantName,
      expiresMinutes: Math.floor(EMAIL_OTP_TTL_MS / 60000),
    });
  } catch (err) {
    // Roll back the OTP so a failed send doesn't leave a live code in the DB
    user.emailOtpHash = null;
    user.emailOtpPurpose = null;
    user.emailOtpExpires = null;
    await user.save({ validateBeforeSave: false });
    throw err;
  }
};

// POST /api/auth/register-with-otp — public self-service registration.
// Creates an inactive user and emails a 6-digit verification code. The user
// stays inactive until an admin activates them — verifying the email only
// confirms ownership of the address; it does not grant access.
router.post('/register-with-otp', otpLimiter, async (req, res) => {
  // Self-signup is off unless the platform switched it on for this company.
  // Checked first, so no account is created and no OTP is sent otherwise.
  if (req.tenant?.allowSelfSignup !== true) {
    return sendError(res, 'Self sign-up is not enabled for this company', 403);
  }

  const { name, email, password } = req.body || {};

  if (!name || typeof name !== 'string' || name.trim().length < 2) {
    return sendError(res, 'Name is required (at least 2 characters)', 400);
  }
  const emailNorm = String(email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNorm)) {
    return sendError(res, 'A valid email is required', 400);
  }
  if (!password || password.length < 8) {
    return sendError(res, 'Password must be at least 8 characters', 400);
  }

  if (!isEmailConfigured()) {
    return sendError(
      res,
      'Email service is not configured on the server. Set RESEND_API_KEY to enable email delivery.',
      503,
    );
  }

  const User = getModel(req, 'User');
  const existing = await User.findOne({ email: emailNorm });
  if (existing) {
    // Don't reveal whether the email exists — but we still need the user to be
    // able to retry, so we re-issue an OTP for an unverified, inactive account.
    if (!existing.isActive && !existing.emailVerifiedAt) {
      try {
        await issueAndSendOtp({ user: existing, purpose: 'verify_email', tenantName: req.tenant?.name });
      } catch (err) {
        logger.error('Failed to re-issue verification OTP', { email: emailNorm, error: err.message });
        // Surface the failure exactly like the new-account path does. Reporting
        // success here sends the user to the OTP screen for a code that was
        // never delivered, and a delivery failure is a server-side condition
        // that says nothing about whether the email is registered.
        return sendError(res, `Could not send verification email: ${err.message}`, 502);
      }
      return sendSuccess(res, {
        email: emailNorm,
        message: 'A verification code has been sent to your email.',
      });
    }
    return sendError(res, 'A user with this email already exists', 409);
  }

  const user = new User({
    name: name.trim(),
    email: emailNorm,
    password,
    // roleId is required by the schema but admins assign it during activation;
    // we leave it unset and let the document fail validation only on full save.
    isActive: false,
  });

  // Persist password hash + email + OTP without running role validation —
  // the user is unusable until the admin activates and assigns a role.
  user.password = password; // pre-save hook hashes
  await user.save({ validateBeforeSave: false });

  try {
    await issueAndSendOtp({ user, purpose: 'verify_email', tenantName: req.tenant?.name });
  } catch (err) {
    logger.error('Failed to send verification OTP', { email: emailNorm, error: err.message });
    // Leave the user record in place so retrying registration re-issues an OTP
    // via the "existing && unverified" branch above.
    return sendError(res, `Could not send verification email: ${err.message}`, 502);
  }

  return sendSuccess(res, {
    email: emailNorm,
    message: 'Account created. A verification code has been sent to your email.',
  }, 201);
});

// POST /api/auth/send-otp — issue a new OTP for an existing user.
// `purpose` controls what the code can be used for downstream:
//   verify_email   — re-send the email-verification code
//   login          — passwordless sign-in (requires emailVerifiedAt + isActive)
//   password_reset — alternative to the email-link reset flow
//
// Always responds 200 to avoid leaking whether an email exists.
router.post('/send-otp', otpLimiter, async (req, res) => {
  const emailNorm = String(req.body?.email || '').trim().toLowerCase();
  const purpose = req.body?.purpose || 'verify_email';

  if (!['verify_email', 'login', 'password_reset'].includes(purpose)) {
    return sendError(res, 'Invalid OTP purpose', 400);
  }

  const generic = () => sendSuccess(res, {
    message: 'If an account exists for that email, a verification code has been sent.',
  });

  if (!emailNorm) return generic();
  if (!isEmailConfigured()) {
    logger.warn('send-otp called but no email provider is configured');
    return generic();
  }

  const User = getModel(req, 'User');
  const user = await User.findOne({ email: emailNorm }).select('+emailOtpHash +emailOtpPurpose +emailOtpExpires +emailOtpAttempts');
  if (!user) return generic();

  // Login OTP requires a fully active, verified account
  if (purpose === 'login' && (!user.isActive || !user.emailVerifiedAt)) {
    return generic();
  }

  try {
    await issueAndSendOtp({ user, purpose, tenantName: req.tenant?.name });
  } catch (err) {
    logger.error('Failed to send OTP', { email: emailNorm, purpose, error: err.message });
    // Don't reveal failure to anonymous callers
  }

  return generic();
});

// POST /api/auth/verify-otp — universal OTP verifier.
//
// For purpose='verify_email': marks emailVerifiedAt, returns success.
// For purpose='login':         returns a JWT (only if user is active + verified).
// For purpose='password_reset': requires `password` body field, sets the new password.
router.post('/verify-otp', otpLimiter, async (req, res) => {
  const emailNorm = String(req.body?.email || '').trim().toLowerCase();
  const code = String(req.body?.code || '').trim();
  const purpose = req.body?.purpose;
  const newPassword = req.body?.password;

  if (!emailNorm || !code || !purpose) {
    return sendError(res, 'email, code, and purpose are required', 400);
  }
  if (!/^\d{6}$/.test(code)) {
    return sendError(res, 'Verification code must be 6 digits', 400);
  }
  if (!['verify_email', 'login', 'password_reset'].includes(purpose)) {
    return sendError(res, 'Invalid OTP purpose', 400);
  }
  if (purpose === 'password_reset' && (!newPassword || newPassword.length < 8)) {
    return sendError(res, 'New password must be at least 8 characters', 400);
  }

  const User = getModel(req, 'User');
  const user = await User.findOne({ email: emailNorm })
    .select('+password +emailOtpHash +emailOtpPurpose +emailOtpExpires +emailOtpAttempts')
    .populate('roleId', User.ROLE_ACCESS_FIELDS);
  if (!user) return sendError(res, 'Invalid or expired code', 400);

  if (!user.emailOtpHash || !user.emailOtpExpires || user.emailOtpExpires < new Date()) {
    return sendError(res, 'This verification code has expired. Request a new one.', 400);
  }
  if (user.emailOtpPurpose !== purpose) {
    return sendError(res, 'Invalid or expired code', 400);
  }
  if ((user.emailOtpAttempts || 0) >= EMAIL_OTP_MAX_ATTEMPTS) {
    // Burn the code so they have to request a new one
    user.emailOtpHash = null;
    user.emailOtpPurpose = null;
    user.emailOtpExpires = null;
    user.emailOtpAttempts = 0;
    await user.save({ validateBeforeSave: false });
    return sendError(res, 'Too many incorrect attempts. Request a new code.', 429);
  }

  if (hashEmailOtp(code) !== user.emailOtpHash) {
    user.emailOtpAttempts = (user.emailOtpAttempts || 0) + 1;
    await user.save({ validateBeforeSave: false });
    return sendError(res, 'Invalid verification code', 400);
  }

  // Code is valid — burn it before doing anything else.
  user.emailOtpHash = null;
  user.emailOtpPurpose = null;
  user.emailOtpExpires = null;
  user.emailOtpAttempts = 0;

  if (purpose === 'verify_email') {
    user.emailVerifiedAt = new Date();
    await user.save({ validateBeforeSave: false });
    return sendSuccess(res, {
      email: user.email,
      emailVerifiedAt: user.emailVerifiedAt,
      isActive: user.isActive,
      message: user.isActive
        ? 'Email verified. You can now sign in.'
        : 'Email verified. An administrator will activate your account shortly.',
    });
  }

  if (purpose === 'password_reset') {
    const isSame = await bcrypt.compare(newPassword, user.password);
    if (isSame) return sendError(res, 'New password must be different from your current password', 400);
    user.password = newPassword; // pre-save hook hashes
    await user.save({ validateBeforeSave: false });
    return sendSuccess(res, { email: user.email }, 'Password has been reset. You can now log in.');
  }

  // purpose === 'login' — passwordless sign-in
  if (!user.isActive) {
    return sendError(res, 'Your account is pending activation by an administrator.', 403);
  }
  if (!user.emailVerifiedAt) {
    return sendError(res, 'Email is not verified. Verify your email before signing in.', 403);
  }

  user.lastLogin = new Date();
  user.loginCount = (user.loginCount || 0) + 1;
  await user.save({ validateBeforeSave: false });

  const token = authService.generateToken(user._id, req.tenantKey);
  const authData = await authService.buildAuthResponse(req, user);
  return sendSuccess(res, { token, ...authData });
});

// POST /api/auth/forgot-password-otp — request a 6-digit code instead of a
// magic-link reset. Mirrors /forgot-password's anti-enumeration guarantees.
router.post('/forgot-password-otp', passwordResetLimiter, async (req, res) => {
  const emailNorm = String(req.body?.email || '').trim().toLowerCase();

  const generic = () => sendSuccess(res, {
    message: 'If an account exists for that email, a reset code has been sent.',
  });

  if (!emailNorm) return generic();
  if (!isEmailConfigured()) {
    logger.warn('forgot-password-otp called but no email provider is configured');
    return generic();
  }

  const User = getModel(req, 'User');
  const user = await User.findOne({ email: emailNorm })
    .select('+emailOtpHash +emailOtpPurpose +emailOtpExpires +emailOtpAttempts');
  if (!user || !user.isActive) return generic();

  try {
    await issueAndSendOtp({ user, purpose: 'password_reset', tenantName: req.tenant?.name });
  } catch (err) {
    logger.error('Failed to send password reset OTP', { email: emailNorm, error: err.message });
  }

  return generic();
});

module.exports = router;
