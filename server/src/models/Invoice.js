const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const invoiceSchema = new Schema(
  {
    invoiceNo: {
      type: String,
      unique: true,
    },
    projectId: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
      index: true,
    },
    clientId: {
      type: Schema.Types.ObjectId,
      ref: 'Client',
      required: true,
      index: true,
    },
    attendanceBatchId: {
      type: Schema.Types.ObjectId,
      ref: 'AttendanceBatch',
    },
    period: {
      year: { type: Number, required: true },
      month: { type: Number, required: true },
    },
    servicePeriodFrom: {
      type: Date,
    },
    servicePeriodTo: {
      type: Date,
    },
    // Line items — one row per driver
    lineItems: [
      {
        driverId: { type: Schema.Types.ObjectId, ref: 'Driver' },
        driverName: { type: String },
        employeeCode: { type: String },
        workingDays: { type: Number },
        ratePerDriver: { type: Number }, // from project contract
        dailyRate: { type: Number }, // ratePerDriver / 26
        amount: { type: Number }, // dailyRate * workingDays
        vatRate: { type: Number, default: 0.05 },
        vatAmount: { type: Number },
        totalWithVat: { type: Number },
      },
    ],
    // Legacy: project-grouped line items (kept for backward compat with existing invoices)
    projectGroups: [
      {
        projectId: { type: Schema.Types.ObjectId, ref: 'Project' },
        projectName: { type: String },
        projectCode: { type: String },
        ratePerDriver: { type: Number },
        dailyRate: { type: Number },
        drivers: [
          {
            driverId: { type: Schema.Types.ObjectId, ref: 'Driver' },
            driverName: { type: String },
            employeeCode: { type: String },
            workingDays: { type: Number },
            overtimeHours: { type: Number, default: 0 },
            ratePerDay: { type: Number },
            amount: { type: Number },
          },
        ],
        driverCount: { type: Number },
        subtotal: { type: Number },
      },
    ],
    driverCount: {
      type: Number,
    },
    subtotal: {
      type: Number,
      required: true,
    },
    vatRate: {
      type: Number,
      default: 0.05,
    },
    vatAmount: {
      type: Number,
      required: true,
    },
    total: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      enum: ['draft', 'sent', 'paid', 'overdue', 'cancelled'],
      default: 'draft',
    },
    issuedDate: {
      type: Date,
      default: Date.now,
    },
    dueDate: {
      type: Date,
    },
    paidDate: {
      type: Date,
    },
    creditNotes: [
      {
        amount: { type: Number },
        reason: { type: String },
        driverId: { type: Schema.Types.ObjectId, ref: 'Driver' },
        createdAt: { type: Date, default: Date.now },
      },
    ],
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
);

// Auto-compute servicePeriodFrom/To from period year+month if not set
invoiceSchema.pre('save', function (next) {
  if (this.period && this.period.year && this.period.month) {
    if (!this.servicePeriodFrom) {
      this.servicePeriodFrom = new Date(this.period.year, this.period.month - 1, 1);
    }
    if (!this.servicePeriodTo) {
      // Last day of the month
      this.servicePeriodTo = new Date(this.period.year, this.period.month, 0);
    }
  }
  next();
});

// Auto-generate invoiceNo: INV-YYYY-MM-XXXXX
invoiceSchema.pre('save', async function (next) {
  if (this.invoiceNo) return next();

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
    'invoice_no',
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );

  const yyyy = this.period?.year || new Date().getFullYear();
  const mm = String(this.period?.month || new Date().getMonth() + 1).padStart(
    2,
    '0'
  );

  this.invoiceNo = `INV-${yyyy}-${mm}-${String(counter.seq).padStart(5, '0')}`;
  next();
});

module.exports = mongoose.model('Invoice', invoiceSchema);
