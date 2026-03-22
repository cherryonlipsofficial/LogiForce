const mongoose = require('mongoose');

const invoiceSchema = new mongoose.Schema(
  {
    invoiceNo: {
      type: String,
      unique: true,
    },
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Client',
      required: true,
    },
    period: {
      year: { type: Number },
      month: { type: Number },
    },
    lineItems: [
      {
        driverId: { type: mongoose.Schema.Types.ObjectId, ref: 'Driver' },
        employeeCode: { type: String },
        driverName: { type: String },
        workingDays: { type: Number },
        ratePerDay: { type: Number },
        amount: { type: Number },
      },
    ],
    driverCount: {
      type: Number,
    },
    subtotal: {
      type: Number,
    },
    vatRate: {
      type: Number,
      default: 0.05,
    },
    vatAmount: {
      type: Number,
    },
    total: {
      type: Number,
    },
    status: {
      type: String,
      enum: ['draft', 'sent', 'paid', 'overdue', 'cancelled'],
      default: 'draft',
    },
    issuedDate: {
      type: Date,
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
        driverId: { type: mongoose.Schema.Types.ObjectId, ref: 'Driver' },
        createdAt: { type: Date, default: Date.now },
      },
    ],
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
);

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
