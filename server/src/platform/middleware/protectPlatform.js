/**
 * Auth middleware for platform (product-owner) routes.
 *
 * protectPlatform accepts only platform JWTs: signed with PLATFORM_JWT_SECRET
 * (HS256), audience 'platform', issuer 'logiforce-platform', and carrying the
 * user's current tokenVersion. A tenant token (JWT_SECRET, aud 'tenant') fails
 * here, and a platform token fails the tenant protect().
 *
 * It sets req.platformUser and never req.user, so tenant permission checks
 * can't mistake a platform user for a company user. req.platformUser.permissions
 * comes from the user's PlatformRole, read on every request.
 */
const { getPlatformModels } = require('../models');
const { verifyPlatformToken } = require('../services/platformAuth.service');
const { loadPlatformAccess } = require('../services/platformAccess.service');
const { isPlatformPermissionKey } = require('../../config/platformPermissions');

const OBJECT_ID = /^[a-f0-9]{24}$/i;

const notAuthorized = (res) => res.status(401).json({
  success: false,
  message: 'Not authorized',
  code: 'PLATFORM_AUTH_REQUIRED',
});

const forbidden = (res, required) => res.status(403).json({
  success: false,
  message: 'You do not have access to this action',
  code: 'PLATFORM_FORBIDDEN',
  requiredPermission: required,
});

const protectPlatform = async (req, res, next) => {
  // Same token source as the tenant protect() in middleware/auth.js.
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return notAuthorized(res);

  let decoded;
  try {
    decoded = verifyPlatformToken(token);
  } catch {
    return notAuthorized(res);
  }

  if (!decoded || typeof decoded.sub !== 'string' || !OBJECT_ID.test(decoded.sub) || !Number.isInteger(decoded.tv)) {
    return notAuthorized(res);
  }

  // A database error is not an auth failure: let it reach the error handler (500).
  const { PlatformUser } = getPlatformModels();
  const user = await PlatformUser.findById(decoded.sub).select('email name roleKey isActive tokenVersion').lean();

  if (!user || user.isActive !== true || decoded.tv !== (user.tokenVersion ?? 0)) {
    return notAuthorized(res);
  }

  const access = await loadPlatformAccess(user);
  req.platformUser = {
    _id: user._id,
    email: user.email,
    name: user.name,
    roleKey: access.roleKey,
    roleName: access.roleName,
    permissions: access.permissions,
  };
  return next();
};

const assertKnown = (keys) => {
  for (const key of keys) {
    if (!isPlatformPermissionKey(key)) throw new Error(`Unknown platform permission: ${key}`);
  }
};

/**
 * requirePlatformPermission('platform.tenants.create'). Use after protectPlatform.
 * Throws at startup for a key that isn't in config/platformPermissions.js.
 */
const requirePlatformPermission = (key) => {
  assertKnown([key]);
  return (req, res, next) => {
    if (!req.platformUser) return notAuthorized(res);
    if (!req.platformUser.permissions.includes(key)) return forbidden(res, key);
    return next();
  };
};

/** Passes when the user holds at least one of `keys`. */
const requireAnyPlatformPermission = (keys) => {
  assertKnown(keys);
  return (req, res, next) => {
    if (!req.platformUser) return notAuthorized(res);
    if (!keys.some((k) => req.platformUser.permissions.includes(k))) return forbidden(res, keys);
    return next();
  };
};

module.exports = { protectPlatform, requirePlatformPermission, requireAnyPlatformPermission };
