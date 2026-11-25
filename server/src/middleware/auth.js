const jwt = require('jsonwebtoken');
const { getModel } = require('../config/modelRegistry');
const { getEffectivePermissions } = require('../config/permissions');
const { TENANT_TOKEN_AUDIENCE } = require('../modules/shared/auth.service');
const logger = require('../utils/logger');

const WRONG_COMPANY = { success: false, message: 'Token is not valid for this company' };

/**
 * Company-user auth. Accepts only tokens with aud 'tenant' whose `tid` is the
 * company this request was resolved to (req.tenantKey, set by resolveTenant).
 * Fails closed: without req.tenantKey every token is rejected.
 */
const protect = async (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ success: false, message: 'No token, authorization denied' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET, { audience: TENANT_TOKEN_AUDIENCE });

    if (!req.tenantKey) {
      logger.error('protect ran without req.tenantKey; is resolveTenant mounted before this route?', {
        method: req.method,
        path: req.originalUrl,
      });
      return res.status(401).json(WRONG_COMPANY);
    }
    if (decoded.tid == null || String(decoded.tid) !== String(req.tenantKey)) {
      return res.status(401).json(WRONG_COMPANY);
    }

    const User = getModel(req, 'User');
    const user = await User.findById(decoded.id).populate('roleId', User.ROLE_ACCESS_FIELDS);
    if (!user || !user.isActive) {
      return res.status(401).json({ success: false, message: 'User not found or inactive' });
    }
    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ success: false, message: 'Token is not valid' });
  }
};

/**
 * Works out req.userPermissions for the signed-in user with the shared
 * getEffectivePermissions (role + overrides, cut to the tenant's ceiling).
 * There is no admin bypass and no wildcard: an admin is a role like any other.
 */
const resolvePermissions = async (req) => {
  await req.user.loadRole();
  req.userPermissions = getEffectivePermissions(req.tenant, req.user);
  return req.userPermissions;
};

/**
 * Middleware factory. Checks that the authenticated user has the given permission.
 * Usage: router.get('/route', protect, requirePermission('drivers.edit'), handler)
 */
const requirePermission = (permissionKey) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'Not authenticated' });
      }

      const perms = await resolvePermissions(req);
      if (!perms.includes(permissionKey)) {
        return res.status(403).json({
          success: false,
          message: `Access denied. Required permission: ${permissionKey}`,
          requiredPermission: permissionKey,
        });
      }
      next();
    } catch (err) {
      next(err);
    }
  };
};

/**
 * Attaches the user's effective permissions to req.userPermissions without
 * blocking. For routes that check permissions conditionally in the handler.
 */
const attachPermissions = async (req, res, next) => {
  if (!req.user) return next();
  try {
    await resolvePermissions(req);
    next();
  } catch (err) {
    next(err);
  }
};

/**
 * Middleware factory. Checks that the authenticated user has at least one of the given permissions.
 * Usage: router.post('/route', protect, requireAnyPermission(['perm.a', 'perm.b']), handler)
 */
const requireAnyPermission = (permissionKeys) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'Not authenticated' });
      }

      const perms = await resolvePermissions(req);
      if (!permissionKeys.some((key) => perms.includes(key))) {
        return res.status(403).json({
          success: false,
          message: `Access denied. Requires one of: ${permissionKeys.join(', ')}`,
          requiredPermissions: permissionKeys,
        });
      }
      next();
    } catch (err) {
      next(err);
    }
  };
};

module.exports = { protect, requirePermission, requireAnyPermission, attachPermissions };
