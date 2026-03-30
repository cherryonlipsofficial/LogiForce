const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const appNotificationSchema = new Schema(
  {
    // Who receives this notification
    recipientId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    recipientRole: { type: String },

    // What triggered it
    type: {
      type: String,
      required: true,
      enum: [
        'attendance_uploaded',
        'attendance_approved',
        'attendance_disputed',
        'attendance_fully_approved',
        'dispute_responded',
        'invoice_generated',
        'salary_run_ready',
        'advance_requested',
        'advance_approved',
        'advance_rejected',
        'salary_ops_approved',
        'salary_compliance_approved',
        'salary_accounts_approved',
        'salary_processed',
        'salary_approval_reminder',
        'credit_note_created',
        'credit_note_sent',
        'credit_note_adjusted',
        'credit_note_settled',
      ],
    },

    title: { type: String, required: true },
    message: { type: String, required: true },

    // Link to the relevant record
    referenceModel: { type: String }, // 'AttendanceBatch', 'Invoice', etc.
    referenceId: { type: Schema.Types.ObjectId },

    // Read state
    isRead: { type: Boolean, default: false, index: true },
    readAt: { type: Date },

    // Who triggered this notification
    triggeredBy: { type: Schema.Types.ObjectId, ref: 'User' },
    triggeredByName: { type: String },
  },
  { timestamps: true }
);

appNotificationSchema.index({ recipientId: 1, isRead: 1, createdAt: -1 });

module.exports = mongoose.model('AppNotification', appNotificationSchema);
