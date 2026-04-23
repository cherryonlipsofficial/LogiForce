const { getModel } = require('../../config/modelRegistry');

/**
 * Log any driver event to the history collection.
 * performedBy must be a populated User object or userId.
 */
async function logEvent(req, driverId, eventType, details, performedBy) {
  const DriverHistory = getModel(req, 'DriverHistory');
  const User = getModel(req, 'User');

  let user = typeof performedBy === 'object' ? performedBy : await User.findById(performedBy).populate('roleId');
  // If roleId wasn't populated (just an ObjectId / string), resolve it so we record a real role label.
  // Handles both Mongoose docs (populate) and plain/lean objects (Role.findById).
  if (user && user.roleId && typeof user.roleId !== 'object') {
    try {
      if (typeof user.populate === 'function') {
        await user.populate('roleId');
      } else {
        const Role = getModel(req, 'Role');
        const role = await Role.findById(user.roleId).select('name displayName').lean();
        if (role) user.roleId = role;
      }
    } catch (_) { /* best-effort */ }
  }
  await DriverHistory.create({
    driverId,
    eventType,
    performedBy:      user._id,
    performedByName:  user.name,
    performedByRole:  user.roleId?.displayName || user.roleId?.name || null,
    description:      details.description,
    statusFrom:       details.statusFrom,
    statusTo:         details.statusTo,
    documentType:     details.documentType,
    fieldName:        details.fieldName,
    oldValue:         details.oldValue !== undefined ? String(details.oldValue) : undefined,
    newValue:         details.newValue !== undefined ? String(details.newValue) : undefined,
    reason:           details.reason,
    metadata:         details.metadata,
  });
}

/**
 * Convenience: log a status change specifically.
 */
async function logStatusChange(req, driverId, from, to, reason, description, performedBy) {
  await logEvent(req, driverId, 'status_change', {
    statusFrom:  from,
    statusTo:    to,
    reason:      reason,
    description: description || `Status transitioned from ${from} to ${to}`,
  }, performedBy);
}

/**
 * Get paginated history for a driver.
 */
async function getHistory(req, driverId, page = 1, limit = 30) {
  const DriverHistory = getModel(req, 'DriverHistory');

  page = Math.max(1, parseInt(page) || 1);
  limit = Math.min(100, Math.max(1, parseInt(limit) || 30));
  const skip = (page - 1) * limit;

  const [entries, total] = await Promise.all([
    DriverHistory.find({ driverId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('performedBy', 'name email')
      .lean(),
    DriverHistory.countDocuments({ driverId }),
  ]);
  return { entries, total, page, limit };
}

module.exports = { logEvent, logStatusChange, getHistory };
