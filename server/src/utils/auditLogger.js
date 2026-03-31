const AuditLog = require('../models/AuditLog');
const logger = require('./logger');

const logChange = async (model, documentId, field, oldValue, newValue, userId, action) => {
  try {
    await AuditLog.create({
      model,
      documentId,
      field,
      oldValue,
      newValue,
      userId,
      action,
      timestamp: new Date(),
    });
  } catch (err) {
    logger.error('Audit log write failed', { error: err.message });
  }
};

module.exports = { logChange };
