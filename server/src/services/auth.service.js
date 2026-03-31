const jwt = require('jsonwebtoken');
const User = require('../models/User');

const generateToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
};

const login = async (email, password) => {
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
  await user.save({ validateBeforeSave: false });

  const token = generateToken(user._id);
  return { token, user };
};

const register = async (userData) => {
  const user = await User.create(userData);
  await user.populate('roleId');
  const token = generateToken(user._id);
  return { token, user };
};

/**
 * Build a unified auth response containing user, permissions, and isAdmin flag.
 * Used by both login and /me endpoints to avoid a second round-trip.
 */
const buildAuthResponse = async (user) => {
  if (!user.roleId || typeof user.roleId === 'string') {
    await user.populate('roleId');
  }

  const isAdmin = user.roleId?.isSystemRole === true;

  if (isAdmin) {
    const { getAllKeys } = require('../config/permissions');
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

module.exports = { generateToken, login, register, buildAuthResponse };
