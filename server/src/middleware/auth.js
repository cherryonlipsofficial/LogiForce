const jwt = require('jsonwebtoken');
const User = require('../models/User');

const protect = async (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ success: false, message: 'No token, authorization denied' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).populate('roleId');
    if (!user || !user.isActive) {
      return res.status(401).json({ success: false, message: 'User not found or inactive' });
    }
    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ success: false, message: 'Token is not valid' });
  }
};

// New permission-based middleware — checks the resolved permission set
const requirePermission = (...permissionKeys) => {
  return async (req, res, next) => {
    try {
      const userPerms = await req.user.getPermissions();
      const hasAny = permissionKeys.some(key => userPerms.includes(key));
      if (!hasAny) {
        return res.status(403).json({
          success: false,
          message: 'You do not have permission to perform this action',
        });
      }
      next();
    } catch (error) {
      res.status(500).json({ success: false, message: 'Permission check failed' });
    }
  };
};

// Legacy role-name check — kept for backward compatibility during migration
const restrictTo = (...roles) => {
  return (req, res, next) => {
    const roleName = req.user.roleId?.name || req.user.role;
    if (!roles.includes(roleName)) {
      return res.status(403).json({ success: false, message: 'You do not have permission to perform this action' });
    }
    next();
  };
};

module.exports = { protect, restrictTo, requirePermission };
