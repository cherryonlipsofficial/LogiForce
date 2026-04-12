const mongoose = require('mongoose');
const { Schema } = mongoose;

const billAllocationSchema = new Schema(
  {
    driverId: {
      type: Schema.Types.ObjectId,
      ref: 'Driver',
    },
    driverName: { type: String },
    driverEmployeeCode: { type: String },
    fromDate: { type: Date },
    toDate: { type: Date },
    daysUsed: { type: Number },
    totalDaysInPeriod: { type: Number },
    allocatedAmount: { type: Number },
    isExtra: { type: Boolean, default: false },
    deductedInSalaryRunId: {
      type: Schema.Types.ObjectId,
      ref: 'SalaryRun',
      default: null,
    },
    status: {
      type: String,
      enum: ['pending', 'allocated', 'waived', 'deducted'],
      default: 'pending',
    },
  },
  { _id: true }
);

const simBillSchema = new Schema(
  {
    simId: {
      type: Schema.Types.ObjectId,
      ref: 'TelecomSim',
      required: true,
      index: true,
    },
    simNumber: {
      type: String,
      required: true,
    },
    invoiceNumber: {
      type: String,
      required: true,
    },

    period: {
      year: { type: Number, required: true },
      month: { type: Number, required: true },
    },

    billDate: { type: Date },
    billPeriodStart: { type: Date },
    billPeriodEnd: { type: Date },

    serviceRentals: { type: Number, default: 0 },
    usageCharges: { type: Number, default: 0 },
    oneTimeCharges: { type: Number, default: 0 },
    otherCharges: { type: Number, default: 0 },
    vatAmount: { type: Number, default: 0 },
    totalAmount: { type: Number, required: true },

    allocations: [billAllocationSchema],

    isIdleBill: { type: Boolean, default: false },

    pdfFileKey: { type: String },
    importBatchId: { type: String },

    accountOwner: { type: String },

    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
);

simBillSchema.index(
  { simNumber: 1, 'period.year': 1, 'period.month': 1 },
  { unique: true }
);
simBillSchema.index({ importBatchId: 1 });

const SimBill = mongoose.model('SimBill', simBillSchema);
module.exports = SimBill;
module.exports.schema = simBillSchema;
