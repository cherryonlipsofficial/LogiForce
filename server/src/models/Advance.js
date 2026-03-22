const mongoose = require('mongoose');

const advanceSchema = new mongoose.Schema(
  {
    driverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Driver',
      required: true,
    },
    amountIssued: {
      type: Number,
      required: [true, 'Amount issued is required'],
    },
    amountRecovered: {
      type: Number,
      default: 0,
    },
    recoverySchedule: [
      {
        salaryRunId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'SalaryRun',
        },
        amount: { type: Number },
        date: { type: Date },
      },
    ],
    issueDate: {
      type: Date,
    },
    status: {
      type: String,
      enum: ['active', 'fully_recovered', 'written_off'],
      default: 'active',
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    notes: {
      type: String,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

advanceSchema.virtual('outstandingBalance').get(function () {
  return this.amountIssued - this.amountRecovered;
});

module.exports = mongoose.model('Advance', advanceSchema);
