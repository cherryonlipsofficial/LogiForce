const mongoose = require('mongoose');

const driverLedgerSchema = new mongoose.Schema(
  {
    driverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Driver',
      required: true,
    },
    salaryRunId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SalaryRun',
    },
    entryType: {
      type: String,
      enum: [
        'salary_credit',
        'deduction_debit',
        'advance_issued',
        'advance_recovery',
        'manual_credit',
        'manual_debit',
        'penalty',
        'credit_note',
        'credit_note_debit',
        'receivable_recovery',
      ],
      required: true,
    },
    debit: {
      type: Number,
      default: 0,
    },
    credit: {
      type: Number,
      default: 0,
    },
    runningBalance: {
      type: Number,
    },
    description: {
      type: String,
      required: [true, 'Description is required'],
    },
    referenceId: {
      type: String,
    },
    period: {
      year: { type: Number },
      month: { type: Number },
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

module.exports = mongoose.model('DriverLedger', driverLedgerSchema);
