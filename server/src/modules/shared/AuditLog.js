const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  // Who performed the action
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true,
  },
  userName: { type: String },
  userEmail: { type: String },
  userRole: { type: String },

  // What was done — HTTP-level
  method: { type: String, index: true },        // POST / PUT / PATCH / DELETE
  path: { type: String },                       // /api/drivers/:id
  statusCode: { type: Number },

  // Domain-level classification
  action: { type: String, required: true, index: true }, // e.g. 'driver.update', 'login', 'user.create'
  entityType: { type: String, index: true },    // e.g. 'drivers', 'clients', 'users'
  entityId: { type: String },                   // the id from the URL, if any
  entityLabel: { type: String },                // optional human label (e.g. driver name)

  // Legacy fields — still used by utils/auditLogger.logChange
  model: { type: String, index: true },
  documentId: { type: mongoose.Schema.Types.ObjectId },
  field: { type: String },
  oldValue: { type: mongoose.Schema.Types.Mixed },
  newValue: { type: mongoose.Schema.Types.Mixed },

  // Human-readable description shown in the UI
  description: { type: String },

  // Flexible metadata (request body excerpts, IP, etc.)
  metadata: { type: mongoose.Schema.Types.Mixed },

  // IP / user agent for security forensics
  ip: { type: String },
  userAgent: { type: String },

  timestamp: {
    type: Date,
    default: Date.now,
    index: true,
  },
});

auditLogSchema.index({ userId: 1, timestamp: -1 });
auditLogSchema.index({ entityType: 1, entityId: 1, timestamp: -1 });

const AuditLog = mongoose.model('AuditLog', auditLogSchema);
module.exports = AuditLog;
module.exports.schema = auditLogSchema;
