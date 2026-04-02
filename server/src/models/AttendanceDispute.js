const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const attendanceDisputeSchema = new Schema(
  {
    batchId: {
      type: Schema.Types.ObjectId,
      ref: 'AttendanceBatch',
      required: true,
      index: true,
    },
    projectId: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
    },
    clientId: {
      type: Schema.Types.ObjectId,
      ref: 'Client',
      required: true,
    },

    // Who raised it — Sales or Ops user
    raisedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    raisedByName: { type: String },
    raisedByRole: { type: String }, // 'sales' or 'ops'
    raisedAt: { type: Date, default: Date.now },

    // What the issue is
    disputeType: {
      type: String,
      required: true,
      enum: [
        'incorrect_days',
        'missing_driver',
        'extra_driver',
        'overtime_mismatch',
        'other',
      ],
    },

    reason: {
      type: String,
      required: true,
      minlength: 10,
    },

    // Specific drivers affected (optional)
    disputedDriverIds: [{ type: Schema.Types.ObjectId, ref: 'Driver' }],
    disputedDriverCodes: [{ type: String }],

    status: {
      type: String,
      enum: ['open', 'responded', 'resolved'],
      default: 'open',
      index: true,
    },

    // Accounts responds
    response: {
      respondedBy: { type: Schema.Types.ObjectId, ref: 'User' },
      respondedByName: { type: String },
      respondedAt: { type: Date },
      message: { type: String },
    },

    resolvedAt: { type: Date },
    resolvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    resolvedNotes: { type: String },
  },
  { timestamps: true }
);

attendanceDisputeSchema.index({ batchId: 1, status: 1 });

const AttendanceDispute = mongoose.model('AttendanceDispute', attendanceDisputeSchema);
module.exports = AttendanceDispute;
module.exports.schema = attendanceDisputeSchema;
