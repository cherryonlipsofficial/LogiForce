const AuditLog = require('../models/AuditLog');

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
    console.error('Audit log write failed:', err.message);
  }
};

module.exports = { logChange };
