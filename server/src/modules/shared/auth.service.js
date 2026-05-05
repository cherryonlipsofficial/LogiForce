const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { getModel } = require('../../config/modelRegistry');

const PASSWORD_RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

const generateToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
};

const hashResetToken = (token) =>
  crypto.createHash('sha256').update(token).digest('hex');

/**
 * Generate a password reset token for the given email.
 * Always returns success to avoid leaking which emails are registered.
 * Returns the raw token + expiry so the caller (route handler) can deliver it
 * (email service, dev log, etc.).
 */
const requestPasswordReset = async (req, email) => {
  const User = getModel(req, 'User');
  const normalizedEmail = (email || '').toLowerCase().trim();
  const user = await User.findOne({ email: normalizedEmail });

  if (!user || !user.isActive) {
    // Silent no-op — caller should still respond with a generic success message
    return { delivered: false, user: null, token: null, expiresAt: null };
  }

  const rawToken = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS);

  user.passwordResetTokenHash = hashResetToken(rawToken);
  user.passwordResetExpires = expiresAt;
  await user.save({ validateBeforeSave: false });

  return { delivered: true, user, token: rawToken, expiresAt };
};

/**
 * Validate a password reset token and update the user's password.
 * Throws on invalid/expired token. Clears the token on success.
 */
const resetPassword = async (req, token, newPassword) => {
  if (!token || typeof token !== 'string') {
    const err = new Error('Reset token is required');
    err.statusCode = 400;
    throw err;
  }
  if (!newPassword || newPassword.length < 8) {
    const err = new Error('New password must be at least 8 characters');
    err.statusCode = 400;
    throw err;
  }

  const User = getModel(req, 'User');
  const tokenHash = hashResetToken(token);

  const user = await User.findOne({ passwordResetTokenHash: tokenHash })
    .select('+password +passwordResetTokenHash +passwordResetExpires');

  if (!user || !user.passwordResetExpires || user.passwordResetExpires < new Date()) {
    const err = new Error('Reset link is invalid or has expired');
    err.statusCode = 400;
    throw err;
  }

  user.password = newPassword;
  user.passwordResetTokenHash = null;
  user.passwordResetExpires = null;
  await user.save();

  return user;
};

const login = async (req, email, password) => {
  const User = getModel(req, 'User');
  const user = await User.findOne({ email })
    .select('+password')
    .populate('roleId');
  if (!user || !(await user.comparePassword(password))) {
    const err = new Error('Invalid email or password');
    err.statusCode = 401;
    throw err;
  }

  if (!user.isActive) {
    throw Object.assign(
      new Error('Your account is pending activation by an administrator. Please contact your admin.'),
      { statusCode: 403, code: 'ACCOUNT_INACTIVE' }
    );
  }

  user.lastLogin = new Date();
  user.loginCount = (user.loginCount || 0) + 1;
  await user.save({ validateBeforeSave: false });

  const token = generateToken(user._id);
  return { token, user };
};

const register = async (req, userData) => {
  const User = getModel(req, 'User');
  const user = await User.create(userData);
  await user.populate('roleId');
  const token = generateToken(user._id);
  return { token, user };
};

/**
 * Build a unified auth response containing user, permissions, and isAdmin flag.
 * Used by both login and /me endpoints to avoid a second round-trip.
 */
const buildAuthResponse = async (req, user) => {
  if (!user.roleId || typeof user.roleId === 'string') {
    await user.populate('roleId');
  }

  const isAdmin = user.roleId?.isSystemRole === true;

  if (isAdmin) {
    const { getAllKeys } = require('../../config/permissions');
    return {
      user: {
        _id: user._id, name: user.name, email: user.email,
        isActive: user.isActive, lastLogin: user.lastLogin,
        activatedBy: user.activatedBy, activatedAt: user.activatedAt,
        roleId: user.roleId,
      },
      permissions: getAllKeys(),
      isAdmin: true,
    };
  }

  const rolePerms = new Set(user.roleId?.permissions || []);
  for (const ov of user.permissionOverrides || []) {
    ov.granted ? rolePerms.add(ov.key) : rolePerms.delete(ov.key);
  }

  return {
    user: {
      _id: user._id, name: user.name, email: user.email,
      isActive: user.isActive, lastLogin: user.lastLogin,
      activatedBy: user.activatedBy, activatedAt: user.activatedAt,
      roleId: user.roleId,
    },
    permissions: [...rolePerms],
    isAdmin: false,
  };
};

module.exports = {
  generateToken,
  login,
  register,
  buildAuthResponse,
  requestPasswordReset,
  resetPassword,
  PASSWORD_RESET_TOKEN_TTL_MS,
};
