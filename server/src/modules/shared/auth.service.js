const jwt = require('jsonwebtoken');
const { getModel } = require('../../config/modelRegistry');

// `aud` of every company-user token. protect() (middleware/auth.js) rejects any
// token without it, which also rejects tokens issued before tokens carried `tid`.
const TENANT_TOKEN_AUDIENCE = 'tenant';

/**
 * Sign a company-user token bound to the company it was issued for.
 * `tenantKey` must be req.tenantKey (the canonical key resolveTenant takes from
 * the platform record), never a value from the request body.
 */
const generateToken = (userId, tenantKey) => {
  if (!tenantKey) throw new Error('generateToken: tenantKey is required');
  return jwt.sign(
    { id: userId, tid: String(tenantKey), aud: TENANT_TOKEN_AUDIENCE },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' },
  );
};

// The User model is bound to req.dbConnection, the database of the company in
// req.tenantKey (one database per company), so a user found here belongs to
// that company.
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

  const token = generateToken(user._id, req.tenantKey);
  return { token, user };
};

const register = async (req, userData) => {
  const User = getModel(req, 'User');
  const user = await User.create(userData);
  await user.populate('roleId');
  const token = generateToken(user._id, req.tenantKey);
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

module.exports = { TENANT_TOKEN_AUDIENCE, generateToken, login, register, buildAuthResponse };
