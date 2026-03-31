const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const salaryRunSchema = new Schema(
  {
    runId: {
      type: String,
      unique: true,
    },
    driverId: {
      type: Schema.Types.ObjectId,
      ref: 'Driver',
      required: true,
    },
    projectId: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
      index: true,
    },
    clientId: {
      type: Schema.Types.ObjectId,
      ref: 'Client',
      required: true,
    },
    attendanceBatchId: {
      type: Schema.Types.ObjectId,
      ref: 'AttendanceBatch',
      required: true,
      // Salary can only run if attendance is fully_approved
    },
    projectRatePerDriver: {
      type: Number,
    },
    period: {
      year: { type: Number },
      month: { type: Number },
    },
    attendanceRecordId: {
      type: Schema.Types.ObjectId,
      ref: 'AttendanceRecord',
    },
    workingDays: {
      type: Number,
    },
    overtimeHours: {
      type: Number,
    },
    totalOrders: {
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
    // Advance deductions applied in this run
    advanceDeductions: [
      {
        advanceId: { type: Schema.Types.ObjectId, ref: 'DriverAdvance' },
        scheduleId: { type: Schema.Types.ObjectId }, // which installment
        amount: { type: Number },
        description: { type: String },
      },
    ],
    status: {
      type: String,
      enum: ['draft', 'ops_approved', 'compliance_approved', 'accounts_approved', 'processed', 'paid', 'disputed'],
      default: 'draft',
    },
    // Multi-stage approval tracking
    approvals: [{
      stage: {
        type: String,
        enum: ['salary.approve_ops', 'salary.approve_compliance', 'salary.approve_accounts'],
        required: true,
      },
      approvedBy: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
      },
      approvedAt: {
        type: Date,
        default: Date.now,
      },
      remarks: { type: String },
    }],
    processedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    processedAt: { type: Date },
    paidAt: {
      type: Date,
    },
    notes: {
      type: String,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: {
      type: Date,
    },
    deletedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    deleteRemark: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

// Compound unique: one salary run per driver per project per period
salaryRunSchema.index(
  { driverId: 1, projectId: 1, 'period.year': 1, 'period.month': 1 },
  { unique: true }
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
