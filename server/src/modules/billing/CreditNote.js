const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const { amountToWords } = require('../../utils/numberToWords');

const creditNoteSchema = new Schema(
  {
    creditNoteNo: {
      type: String,
      unique: true,
    },

    // Scope
    clientId: {
      type: Schema.Types.ObjectId,
      ref: 'Client',
      required: true,
      index: true,
    },
    projectId: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
      index: true,
    },
    period: {
      year: { type: Number, required: true },
      month: { type: Number, required: true },
    },

    // Description — e.g. "Credit Note - Traffic Fine"
    description: { type: String },

    // Multi-driver line items — one row per driver (each can have a different type)
    lineItems: [
      {
        driverId: {
          type: Schema.Types.ObjectId,
          ref: 'Driver',
          required: true,
        },
        driverName: { type: String, required: true },
        noteType: {
          type: String,
          enum: ['traffic_fine', 'penalty', 'damage', 'client_chargeback', 'attendance_correction', 'excess_insurance', 'salik', 'tots', 'accident_report', 'misuse', 'cod', 'other'],
          required: true,
        },
        clientUserId: { type: String },
        employeeCode: { type: String },
        referenceNo: { type: String },
        amount: { type: Number, required: true },
        vatRate: { type: Number, default: 0 },
        vatAmount: { type: Number, default: 0 },
        totalWithVat: { type: Number, required: true },

        // Driver-side salary settlement tracking (per line)
        salaryDeducted: { type: Boolean, default: false },
        salaryDeductedAt: { type: Date },
        salaryRunId: { type: Schema.Types.ObjectId, ref: 'SalaryRun' },

        // When no draft salary exists but driver is active — will auto-deduct in next payroll
        pendingNextSalary: { type: Boolean, default: false },
        pendingNextSalaryAt: { type: Date },

        // When a DriverReceivable was created (resigned/offboarded, no salary to adjust)
        receivableCreated: { type: Boolean, default: false },
        receivableId: { type: Schema.Types.ObjectId, ref: 'DriverReceivable' },

        // For resigned/offboarded drivers where salary deduction isn't possible
        manuallyResolved: { type: Boolean, default: false },
        manualResolutionNote: { type: String },
        manualResolvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
        manualResolvedAt: { type: Date },
      },
    ],

    // Totals
    subtotal: { type: Number, required: true },
    totalVat: { type: Number, default: 0 },
    totalAmount: { type: Number, required: true },
    amountInWords: { type: String },

    // Lifecycle status
    status: {
      type: String,
      enum: ['draft', 'sent', 'adjusted', 'settled', 'cancelled'],
      default: 'draft',
    },

    // Client-side settlement (one action for the whole CN)
    linkedInvoiceId: {
      type: Schema.Types.ObjectId,
      ref: 'Invoice',
    },
    clientAdjustedAt: { type: Date },
    clientAdjustedBy: { type: Schema.Types.ObjectId, ref: 'User' },

    // Audit
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    sentAt: { type: Date },
    sentBy: { type: Schema.Types.ObjectId, ref: 'User' },

    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date },
    deletedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    deleteRemark: { type: String },
  },
  { timestamps: true }
);

// Auto-generate creditNoteNo: CN-YYYY-MM-XXXXX
creditNoteSchema.pre('save', async function (next) {
  if (this.creditNoteNo) return next();

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
    'credit_note_no',
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );

  const yyyy = this.period?.year || new Date().getFullYear();
  const mm = String(this.period?.month || new Date().getMonth() + 1).padStart(2, '0');

  this.creditNoteNo = `CN-${yyyy}-${mm}-${String(counter.seq).padStart(5, '0')}`;
  next();
});

// Auto-compute amountInWords
creditNoteSchema.pre('save', function (next) {
  if (this.totalAmount != null) {
    this.amountInWords = amountToWords(this.totalAmount);
  }
  next();
});

const CreditNote = mongoose.model('CreditNote', creditNoteSchema);
module.exports = CreditNote;
module.exports.schema = creditNoteSchema;
