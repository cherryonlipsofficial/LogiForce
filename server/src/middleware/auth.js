const jwt = require('jsonwebtoken');
const User = require('../models/User');

const protect = async (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ success: false, message: 'No token, authorization denied' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).populate('roleId', 'permissions name isSystemRole displayName');
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
 * Middleware factory. Checks that the authenticated user has the given permission.
 * Usage: router.get('/route', protect, requirePermission('drivers.edit'), handler)
 */
const requirePermission = (permissionKey) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'Not authenticated' });
      }

      // Populate roleId if not already populated
      if (!req.user.roleId || typeof req.user.roleId === 'string') {
        await req.user.populate('roleId', 'permissions name isSystemRole');
      }

      // Build effective permission set: role permissions + user overrides
      const rolePerms = new Set(req.user.roleId?.permissions || []);
      for (const override of req.user.permissionOverrides || []) {
        if (override.granted) rolePerms.add(override.key);
        else rolePerms.delete(override.key);
      }

      // Admin system role bypasses all permission checks
      if (req.user.roleId?.name === 'admin' && req.user.roleId?.isSystemRole) {
        req.userPermissions = [...rolePerms];
        return next();
      }

      if (!rolePerms.has(permissionKey)) {
        return res.status(403).json({
          success: false,
          message: `Access denied. Required permission: ${permissionKey}`,
          requiredPermission: permissionKey,
        });
      }

      req.userPermissions = [...rolePerms];
      next();
    } catch (err) {
      next(err);
    }
  };
};

/**
 * Attaches the user's effective permissions to req.userPermissions without blocking.
 * Useful for routes that need to check permissions conditionally in the handler.
 */
const attachPermissions = async (req, res, next) => {
  if (!req.user) return next();
  try {
    if (!req.user.roleId || typeof req.user.roleId === 'string') {
      await req.user.populate('roleId', 'permissions name isSystemRole');
    }
    const perms = await req.user.getPermissions();
    req.userPermissions = perms;
  } catch {
    // Non-blocking — continue even if permission resolution fails
  }
  next();
};

module.exports = { protect, requirePermission, attachPermissions };
