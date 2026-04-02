const { getModel } = require('../config/modelRegistry');
const logger = require('./logger');

const logChange = async (req, model, documentId, field, oldValue, newValue, userId, action) => {
  try {
    const AuditLog = getModel(req, 'AuditLog');
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
