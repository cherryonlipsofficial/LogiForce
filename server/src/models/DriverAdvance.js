const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const driverAdvanceSchema = new Schema(
  {
    driverId: {
      type: Schema.Types.ObjectId,
      ref: 'Driver',
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

    // Who requested it
    requestedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    requestedByName: { type: String },
    requestedByRole: { type: String },
    requestedAt: { type: Date, default: Date.now },

    amount: { type: Number, required: true, min: 1 },
    reason: { type: String, required: true },

    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'fully_recovered'],
      default: 'pending',
      index: true,
    },

    // Accounts decision
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedByName: { type: String },
    reviewedAt: { type: Date },
    reviewNotes: { type: String },

    // Recovery schedule set by Accounts on approval
    recoverySchedule: [
      {
        installmentNo: { type: Number }, // 1, 2, 3...
        period: {
          year: { type: Number },
          month: { type: Number },
        },
        amountToRecover: { type: Number },
        recovered: { type: Boolean, default: false },
        recoveredAt: { type: Date },
        salaryRunId: { type: Schema.Types.ObjectId, ref: 'SalaryRun' },
      },
    ],

    totalRecovered: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// amountRemaining virtual
driverAdvanceSchema.virtual('amountRemaining').get(function () {
  return this.amount - this.totalRecovered;
});

driverAdvanceSchema.set('toJSON', { virtuals: true });
driverAdvanceSchema.set('toObject', { virtuals: true });

driverAdvanceSchema.index({ driverId: 1, status: 1 });
driverAdvanceSchema.index({ projectId: 1, status: 1 });

module.exports = mongoose.model('DriverAdvance', driverAdvanceSchema);
