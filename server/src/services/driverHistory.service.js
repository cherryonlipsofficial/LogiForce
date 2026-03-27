const { DriverHistory, User } = require('../models');

/**
 * Log any driver event to the history collection.
 * performedBy must be a populated User object or userId.
 */
async function logEvent(driverId, eventType, details, performedBy) {
  const user = typeof performedBy === 'object' ? performedBy : await User.findById(performedBy).populate('roleId');
  await DriverHistory.create({
    driverId,
    eventType,
    performedBy:      user._id,
    performedByName:  user.name,
    performedByRole:  user.roleId?.displayName || user.roleId?.name || 'Unknown',
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
async function logStatusChange(driverId, from, to, reason, description, performedBy) {
  await logEvent(driverId, 'status_change', {
    statusFrom:  from,
    statusTo:    to,
    reason:      reason,
    description: description || `Status transitioned from ${from} to ${to}`,
  }, performedBy);
}

/**
 * Get paginated history for a driver.
 */
async function getHistory(driverId, page = 1, limit = 30) {
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
