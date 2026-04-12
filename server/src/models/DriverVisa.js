const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * DriverVisa — tracks visa cost recovery for drivers on company-sponsored visa
 * or Temporary Work Permit (TWP).
 *
 * Business rules:
 *   - Some drivers get visa for free               → recoverableAmount = 0
 *   - Some get a partial discount/waive-off        → discountAmount > 0
 *   - Some pay a portion in cash upfront            → cashPaid > 0
 *   - Remainder is recovered via monthly deduction → monthlyDeduction > 0
 *   - Finance/Accounts may excuse a given month via manual adjustment on the
 *     Salary Run (the auto-deduction still lives here).
 *
 * Records can be created by Sales / Compliance (permission: driver_visas.create),
 * but only Admin / Finance / Accounts (permission: driver_visas.manage) can edit
 * the financial fields (totalCost, discountAmount, cashPaid, monthlyDeduction,
 * waive / cancel).
 */
const driverVisaSchema = new Schema(
  {
    driverId: {
      type: Schema.Types.ObjectId,
      ref: 'Driver',
      required: true,
      index: true,
    },
    visaCategory: {
      type: String,
      enum: ['company_visa', 'twp'],
      required: true,
    },
    visaNumber: {
      type: String,
      trim: true,
    },
    issueDate: {
      type: Date,
    },
    expiryDate: {
      type: Date,
    },

    // ── Financials ──
    totalCost: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    // Discount / waive-off granted by management (non-recoverable)
    discountAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Part-payment received in cash from the driver (non-recoverable)
    cashPaid: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Agreed monthly deduction from salary. 0 = no auto-deduction (free).
    monthlyDeduction: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Running total recovered via salary deductions (auto-updated by salary flow)
    totalRecovered: {
      type: Number,
      default: 0,
      min: 0,
    },

    status: {
      type: String,
      enum: ['active', 'fully_recovered', 'waived', 'cancelled'],
      default: 'active',
      index: true,
    },
    remarks: {
      type: String,
      trim: true,
    },

    // ── Audit ──
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    lastUpdatedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);

// Virtual: how much is still recoverable from the driver
driverVisaSchema.virtual('recoverableAmount').get(function () {
  const r =
    (this.totalCost || 0) -
    (this.discountAmount || 0) -
    (this.cashPaid || 0);
  return Math.max(0, Math.round(r * 100) / 100);
});

// Virtual: outstanding balance to recover (what's left to deduct)
driverVisaSchema.virtual('outstandingAmount').get(function () {
  const outstanding =
    this.get('recoverableAmount') - (this.totalRecovered || 0);
  return Math.max(0, Math.round(outstanding * 100) / 100);
});

driverVisaSchema.set('toJSON', { virtuals: true });
driverVisaSchema.set('toObject', { virtuals: true });

// One active visa record per driver (historic cancelled/fully_recovered allowed)
driverVisaSchema.index(
  { driverId: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: 'active' } }
);

// Pre-save consistency check: discount + cash cannot exceed totalCost
driverVisaSchema.pre('save', function (next) {
  const nonRecoverable = (this.discountAmount || 0) + (this.cashPaid || 0);
  if (nonRecoverable > (this.totalCost || 0)) {
    return next(
      new Error(
        `discountAmount + cashPaid (${nonRecoverable}) cannot exceed totalCost (${this.totalCost || 0})`
      )
    );
  }
  next();
});

const DriverVisa = mongoose.model('DriverVisa', driverVisaSchema);
module.exports = DriverVisa;
module.exports.schema = driverVisaSchema;
