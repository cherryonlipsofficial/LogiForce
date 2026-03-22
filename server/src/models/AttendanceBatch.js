const mongoose = require('mongoose');

const attendanceBatchSchema = new mongoose.Schema(
  {
    batchId: {
      type: String,
      unique: true,
    },
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Client',
      required: true,
    },
    period: {
      year: { type: Number, required: true },
      month: { type: Number, required: true },
    },
    status: {
      type: String,
      enum: [
        'uploaded',
        'validating',
        'pending_approval',
        'approved',
        'processed',
        'rejected',
      ],
      default: 'uploaded',
    },
    totalRows: {
      type: Number,
    },
    matchedRows: {
      type: Number,
    },
    warningRows: {
      type: Number,
    },
    errorRows: {
      type: Number,
    },
    unmatchedRows: {
      type: Number,
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    approvedAt: {
      type: Date,
    },
    columnMapping: {
      type: mongoose.Schema.Types.Mixed,
    },
    s3Key: {
      type: String,
    },
    validationErrors: [
      {
        driverId: { type: mongoose.Schema.Types.ObjectId, ref: 'Driver' },
        employeeCode: String,
        issue: String,
        details: String,
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Auto-generate batchId: ATT-YYYY-MM-CLIENT
attendanceBatchSchema.pre('save', async function (next) {
  if (this.batchId) return next();

  const Client = mongoose.model('Client');
  const client = await Client.findById(this.clientId).select('name');
  const clientTag = client
    ? client.name.replace(/\s+/g, '_').toUpperCase().substring(0, 10)
    : 'UNKNOWN';
  const yyyy = String(this.period.year);
  const mm = String(this.period.month).padStart(2, '0');

  this.batchId = `ATT-${yyyy}-${mm}-${clientTag}`;
  next();
});

module.exports = mongoose.model('AttendanceBatch', attendanceBatchSchema);
