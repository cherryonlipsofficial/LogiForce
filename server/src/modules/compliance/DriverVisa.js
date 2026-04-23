const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * A single line on the visa statement — either an expense charged to the
 * driver (Total Charges, Medical Insurance, ILOE fine, Quota Modification,
 * etc.) or money received from the driver (cash payments, salary deductions).
 *
 * `source` distinguishes manual entries (added by Finance/Accounts) from
 * automatic ones posted by the salary pipeline.
 */
const visaLineItemSchema = new Schema(
  {
    direction: {
      type: String,
      enum: ['expense', 'received'],
      required: true,
    },
    label: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0 },
    date: { type: Date, default: Date.now },
    source: {
      type: String,
      enum: ['manual_cash', 'manual_charge', 'salary_deduction', 'initial_charge', 'medical_insurance'],
      default: 'manual_charge',
    },
    salaryRunId: { type: Schema.Types.ObjectId, ref: 'SalaryRun' },
    notes: { type: String, trim: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

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
 *
 * Operations team logs `visaProcessedDate` (driver_visas.log_processing).
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
    // Short label used on the statement header (e.g. "HM Visa", "Amazon TWP")
    visaLabel: {
      type: String,
      trim: true,
    },
    // e.g. the person who referred the driver — shown on the statement header
    referenceName: {
      type: String,
      trim: true,
    },
    visaNumber: {
      type: String,
      trim: true,
    },
    issueDate: { type: Date },
    expiryDate: { type: Date, index: true },
    // Ops logs the actual date the visa was processed / stamped
    visaProcessedDate: { type: Date },
    visaProcessedBy: { type: Schema.Types.ObjectId, ref: 'User' },

    // ── Financials (agreed plan) ──
    totalCost: { type: Number, required: true, min: 0, default: 0 },
    // Any separately-tracked medical insurance cost (displayed on statement)
    medicalInsuranceCost: { type: Number, default: 0, min: 0 },
    // Discount / waive-off granted by management (non-recoverable)
    discountAmount: { type: Number, default: 0, min: 0 },
    // Part-payment received in cash from the driver (non-recoverable)
    cashPaid: { type: Number, default: 0, min: 0 },
    // Agreed monthly deduction from salary. 0 = no auto-deduction (free).
    monthlyDeduction: { type: Number, default: 0, min: 0 },
    // Running total recovered via salary deductions (auto-updated by salary flow)
    totalRecovered: { type: Number, default: 0, min: 0 },

    // ── Statement line items (ledger-style) ──
    // Every manual charge, cash payment, and processed salary deduction is
    // appended here so the UI can render a full statement as per the spec.
    lineItems: { type: [visaLineItemSchema], default: [] },

    status: {
      type: String,
      enum: ['active', 'fully_recovered', 'waived', 'cancelled'],
      default: 'active',
      index: true,
    },
    remarks: { type: String, trim: true },

    // ── Audit ──
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    lastUpdatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

/**
 * Statement-level expense total: sum of all expense line items.
 * Falls back to totalCost + medicalInsuranceCost when no line items exist yet
 * (so a freshly created record still renders a meaningful expense figure).
 */
driverVisaSchema.virtual('totalExpense').get(function () {
  if (this.lineItems && this.lineItems.length) {
    const sum = this.lineItems
      .filter((l) => l.direction === 'expense')
      .reduce((s, l) => s + (l.amount || 0), 0);
    return Math.round(sum * 100) / 100;
  }
  return Math.round(((this.totalCost || 0) + (this.medicalInsuranceCost || 0)) * 100) / 100;
});

/**
 * Statement-level received total: sum of all received line items.
 * Falls back to cashPaid + totalRecovered when no line items exist.
 */
driverVisaSchema.virtual('totalReceived').get(function () {
  if (this.lineItems && this.lineItems.length) {
    const sum = this.lineItems
      .filter((l) => l.direction === 'received')
      .reduce((s, l) => s + (l.amount || 0), 0);
    return Math.round(sum * 100) / 100;
  }
  return Math.round(((this.cashPaid || 0) + (this.totalRecovered || 0)) * 100) / 100;
});

/**
 * Statement balance = expense − received. Positive means driver still owes.
 */
driverVisaSchema.virtual('statementBalance').get(function () {
  return Math.round((this.get('totalExpense') - this.get('totalReceived')) * 100) / 100;
});

// Virtual: how much is still recoverable from the driver (vs agreed plan)
driverVisaSchema.virtual('recoverableAmount').get(function () {
  const r =
    (this.totalCost || 0) -
    (this.discountAmount || 0) -
    (this.cashPaid || 0);
  return Math.max(0, Math.round(r * 100) / 100);
});

// Virtual: outstanding balance to recover (what's left to deduct via salary)
driverVisaSchema.virtual('outstandingAmount').get(function () {
  const outstanding =
    this.get('recoverableAmount') - (this.totalRecovered || 0);
  return Math.max(0, Math.round(outstanding * 100) / 100);
});

// Virtual: expiry countdown — helps the UI highlight soon-to-expire visas
driverVisaSchema.virtual('daysUntilExpiry').get(function () {
  if (!this.expiryDate) return null;
  const ms = new Date(this.expiryDate).getTime() - Date.now();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
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
