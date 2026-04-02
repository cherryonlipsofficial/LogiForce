const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const driverReceivableSchema = new Schema(
  {
    receivableNo: {
      type: String,
      unique: true,
    },

    driverId: {
      type: Schema.Types.ObjectId,
      ref: 'Driver',
      required: true,
      index: true,
    },
    driverName: { type: String, required: true },
    employeeCode: { type: String },

    // Source credit note reference
    creditNoteId: {
      type: Schema.Types.ObjectId,
      ref: 'CreditNote',
      required: true,
    },
    creditNoteNo: { type: String, required: true },
    lineItemId: {
      type: Schema.Types.ObjectId,
      required: true,
    },

    // Amount details
    amount: { type: Number, required: true },
    amountRecovered: { type: Number, default: 0 },

    // Why this receivable was created
    reason: {
      type: String,
      enum: [
        'driver_resigned',        // Driver resigned, no future salary
        'driver_offboarded',      // Driver offboarded, no future salary
        'all_salaries_settled',   // All salaries paid, no draft to adjust
      ],
      required: true,
    },

    // Resolution tracking
    status: {
      type: String,
      enum: ['outstanding', 'partially_recovered', 'recovered', 'written_off'],
      default: 'outstanding',
    },

    // Recovery history
    recoveries: [
      {
        method: {
          type: String,
          enum: ['cash', 'bank_transfer', 'security_deposit', 'salary_deduction', 'other'],
          required: true,
        },
        amount: { type: Number, required: true },
        reference: { type: String }, // e.g. bank transfer ref, receipt number
        note: { type: String },
        recoveredBy: { type: Schema.Types.ObjectId, ref: 'User' },
        recoveredAt: { type: Date, default: Date.now },
      },
    ],

    // Write-off (requires approval)
    writtenOff: { type: Boolean, default: false },
    writeOffAmount: { type: Number },
    writeOffReason: { type: String },
    writeOffApprovedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    writeOffApprovedAt: { type: Date },

    // Scope
    clientId: { type: Schema.Types.ObjectId, ref: 'Client' },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project' },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },

    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date },
    deletedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

// Virtual: amount remaining
driverReceivableSchema.virtual('amountRemaining').get(function () {
  return Math.round((this.amount - this.amountRecovered - (this.writeOffAmount || 0)) * 100) / 100;
});

driverReceivableSchema.set('toJSON', { virtuals: true });
driverReceivableSchema.set('toObject', { virtuals: true });

// Auto-generate receivableNo: RCV-YYYY-XXXXX
driverReceivableSchema.pre('save', async function (next) {
  if (this.receivableNo) return next();

  const Counter =
    mongoose.models.Counter ||
    mongoose.model(
      'Counter',
      new mongoose.Schema({
        _id: { type: String, required: true },
        seq: { type: Number, default: 0 },
      })
    );

  const counter = await Counter.findByIdAndUpdate(
    'driver_receivable_no',
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );

  const yyyy = new Date().getFullYear();
  this.receivableNo = `RCV-${yyyy}-${String(counter.seq).padStart(5, '0')}`;
  next();
});

const DriverReceivable = mongoose.model('DriverReceivable', driverReceivableSchema);
module.exports = DriverReceivable;
module.exports.schema = driverReceivableSchema;
