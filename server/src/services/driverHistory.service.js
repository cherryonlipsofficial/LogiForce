const { AuditLog } = require('../models');

/**
 * Log a status change for a driver.
 */
async function logStatusChange(driverId, fromStatus, toStatus, reason, performedBy) {
  await AuditLog.create({
    model: 'Driver',
    documentId: driverId,
    action: 'status_change',
    field: 'status',
    oldValue: fromStatus,
    newValue: toStatus,
    userId: typeof performedBy === 'object' ? performedBy._id : performedBy,
  });
}

/**
 * Log a generic driver event (document upload, field update, etc.).
 */
async function logEvent(driverId, action, details = {}, performedBy) {
  await AuditLog.create({
    model: 'Driver',
    documentId: driverId,
    action,
    field: details.field || null,
    oldValue: details.oldValue || null,
    newValue: details.newValue || details.description || null,
    userId: typeof performedBy === 'object' ? performedBy._id : performedBy,
  });
}

module.exports = {
  logStatusChange,
  logEvent,
};
