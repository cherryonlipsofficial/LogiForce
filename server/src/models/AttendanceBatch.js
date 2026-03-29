const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const attendanceBatchSchema = new Schema(
  {
    batchId: {
      type: String,
      unique: true,
    },
    projectId: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
      index: true,
    },
    // Denormalized from project.clientId at time of creation
    clientId: {
      type: Schema.Types.ObjectId,
      ref: 'Client',
      required: true,
      index: true,
    },
    period: {
      year: { type: Number, required: true },
      month: { type: Number, required: true },
    },
    status: {
      type: String,
      enum: [
        'uploaded',
        'pending_review',
        'sales_approved',
        'ops_approved',
        'fully_approved',
        'disputed',
        'dispute_responded',
        'invoiced',
        'rejected',
      ],
      default: 'uploaded',
      index: true,
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
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    uploadedByName: { type: String },

    // Sales team approval record
    salesApproval: {
      status: {
        type: String,
        enum: ['pending', 'approved', 'disputed'],
        default: 'pending',
      },
      approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
      approvedByName: { type: String },
      approvedAt: { type: Date },
      notes: { type: String },
      disputedBy: { type: Schema.Types.ObjectId, ref: 'User' },
      disputedByName: { type: String },
    },

    // Operations team approval record
    opsApproval: {
      status: {
        type: String,
        enum: ['pending', 'approved', 'disputed'],
        default: 'pending',
      },
      approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
      approvedByName: { type: String },
      approvedAt: { type: Date },
      notes: { type: String },
      disputedBy: { type: Schema.Types.ObjectId, ref: 'User' },
      disputedByName: { type: String },
    },

    // Notification tracking
    notificationSentAt: { type: Date },
    notifiedUserIds: [{ type: Schema.Types.ObjectId, ref: 'User' }],

    // Disputes
    disputes: [{ type: Schema.Types.ObjectId, ref: 'AttendanceDispute' }],

    // Invoice linkage
    invoiceId: { type: Schema.Types.ObjectId, ref: 'Invoice', default: null },
    invoicedAt: { type: Date },
    invoicedBy: { type: Schema.Types.ObjectId, ref: 'User' },

    approvedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    approvedAt: {
      type: Date,
    },
    rejectedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    rejectedAt: {
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
        driverId: { type: Schema.Types.ObjectId, ref: 'Driver' },
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

// Prevents duplicate batch for same project + period
attendanceBatchSchema.index({ projectId: 1, 'period.year': 1, 'period.month': 1 }, { unique: true });

// Auto-generate batchId: ATT-YYYY-MM-PROJECTCODE
attendanceBatchSchema.pre('save', async function (next) {
  if (this.batchId) return next();

  const Project = mongoose.model('Project');
  const project = await Project.findById(this.projectId).select('projectCode');
  const projectTag = project
    ? project.projectCode
    : 'UNKNOWN';
  const yyyy = String(this.period.year);
  const mm = String(this.period.month).padStart(2, '0');

  this.batchId = `ATT-${yyyy}-${mm}-${projectTag}`;
  next();
});

module.exports = mongoose.model('AttendanceBatch', attendanceBatchSchema);
