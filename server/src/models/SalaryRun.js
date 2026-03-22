const mongoose = require('mongoose');

const salaryRunSchema = new mongoose.Schema(
  {
    runId: {
      type: String,
      unique: true,
    },
    driverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Driver',
      required: true,
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
    attendanceRecordId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AttendanceRecord',
    },
    workingDays: {
      type: Number,
    },
    overtimeHours: {
      type: Number,
    },
    baseSalary: {
      type: Number,
    },
    proratedSalary: {
      type: Number,
    },
    overtimePay: {
      type: Number,
    },
    allowances: [
      {
        type: { type: String },
        amount: { type: Number },
      },
    ],
    grossSalary: {
      type: Number,
    },
    deductions: [
      {
        type: { type: String },
        referenceId: { type: String },
        amount: { type: Number },
        description: { type: String },
        status: { type: String },
      },
    ],
    totalDeductions: {
      type: Number,
    },
    netSalary: {
      type: Number,
    },
    status: {
      type: String,
      enum: ['draft', 'pending_approval', 'approved', 'paid', 'disputed'],
      default: 'draft',
    },
    processedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    approvedAt: {
      type: Date,
    },
    paidAt: {
      type: Date,
    },
    notes: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

// Auto-generate runId: SAL-YYYY-MM-XXXXX
salaryRunSchema.pre('save', async function (next) {
  if (this.runId) return next();

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
    'salary_run_id',
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );

  const yyyy = this.period?.year || new Date().getFullYear();
  const mm = String(this.period?.month || new Date().getMonth() + 1).padStart(
    2,
    '0'
  );

  this.runId = `SAL-${yyyy}-${mm}-${String(counter.seq).padStart(5, '0')}`;
  next();
});

module.exports = mongoose.model('SalaryRun', salaryRunSchema);
