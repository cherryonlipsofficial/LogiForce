const jwt = require('jsonwebtoken');
const { getModel } = require('../config/modelRegistry');

const protect = async (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ success: false, message: 'No token, authorization denied' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const User = getModel(req, 'User');
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

      const User = getModel(req, 'User');
      const user = await User.findById(req.user._id)
        .populate('roleId', 'permissions name isSystemRole');

      if (!user) {
        return res.status(401).json({ success: false, message: 'User not found' });
      }

      // ── ADMIN BYPASS ──
      // System admin always passes all permission checks
      if (user.roleId?.isSystemRole === true) {
        req.userPermissions = ['*'];
        return next();
      }

      // Build effective permission set: role permissions + user overrides
      const rolePerms = new Set(user.roleId?.permissions || []);
      for (const override of user.permissionOverrides || []) {
        if (override.granted) rolePerms.add(override.key);
        else rolePerms.delete(override.key);
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

      const User = getModel(req, 'User');
      const user = await User.findById(req.user._id)
        .populate('roleId', 'permissions name isSystemRole');

      if (!user) {
        return res.status(401).json({ success: false, message: 'User not found' });
      }

      if (user.roleId?.isSystemRole === true) {
        req.userPermissions = ['*'];
        return next();
      }

      const rolePerms = new Set(user.roleId?.permissions || []);
      for (const override of user.permissionOverrides || []) {
        if (override.granted) rolePerms.add(override.key);
        else rolePerms.delete(override.key);
      }

      const hasAny = permissionKeys.some((key) => rolePerms.has(key));
      if (!hasAny) {
        return res.status(403).json({
          success: false,
          message: `Access denied. Requires one of: ${permissionKeys.join(', ')}`,
          requiredPermissions: permissionKeys,
        });
      }

      req.userPermissions = [...rolePerms];
      next();
    } catch (err) {
      next(err);
    }
  };
};

module.exports = { protect, requirePermission, requireAnyPermission, attachPermissions };
