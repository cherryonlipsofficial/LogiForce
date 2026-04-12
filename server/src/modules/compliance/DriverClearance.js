const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * DriverClearance
 * Tracks the three-way offboarding clearance required before final salary release:
 *   1. Client clearance      — received by Operations via email
 *   2. Supplier clearance    — received by Operations (only if driver used company/supplier vehicle)
 *   3. Internal clearance    — logged by Accounts after ledger/advance reconciliation
 *
 * When all three are marked received/waived, overallStatus becomes 'completed'
 * and the salary run for this driver can be processed and paid.
 */

const clearanceSubSchema = new Schema(
  {
    status: {
      type: String,
      enum: ['pending', 'received', 'waived', 'not_applicable'],
      default: 'pending',
    },
    receivedDate: { type: Date },
    emailRef: { type: String },        // email subject / message-id / thread ref
    attachmentUrl: { type: String },   // uploaded PDF of the clearance
    remarks: { type: String },
    loggedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    loggedAt: { type: Date },
  },
  { _id: false }
);

const supplierDeductionSchema = new Schema(
  {
    type: {
      type: String,
      enum: ['vehicle_damage', 'fuel', 'salik', 'fine', 'other'],
      required: true,
    },
    amount: { type: Number, required: true, min: 0 },
    description: { type: String },
    // Set once the deduction has been posted to a SalaryRun
    postedToSalaryRunId: { type: Schema.Types.ObjectId, ref: 'SalaryRun' },
    postedAt: { type: Date },
    addedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    addedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const driverClearanceSchema = new Schema(
  {
    clearanceNo: { type: String, unique: true },

    driverId: {
      type: Schema.Types.ObjectId,
      ref: 'Driver',
      required: true,
      index: true,
    },
    driverName: { type: String },
    employeeCode: { type: String },

    projectId: { type: Schema.Types.ObjectId, ref: 'Project' },
    clientId: { type: Schema.Types.ObjectId, ref: 'Client' },
    supplierId: { type: Schema.Types.ObjectId, ref: 'Supplier' },

    // Captured from driver at the moment of offboarding
    lastWorkingDate: { type: Date, required: true },
    triggerStatus: {
      type: String,
      enum: ['resigned', 'offboarded'],
      required: true,
    },

    // True if driver was using our/supplier vehicle at offboarding time.
    // When false, supplierClearance is auto-marked 'not_applicable'.
    usesCompanyVehicle: { type: Boolean, default: false },

    clientClearance: { type: clearanceSubSchema, default: () => ({}) },
    supplierClearance: { type: clearanceSubSchema, default: () => ({}) },
    internalClearance: { type: clearanceSubSchema, default: () => ({}) },

    // Deductions captured from supplier clearance (vehicle damages, fuel, etc.)
    // Synced into the final SalaryRun.deductions[] when processed.
    supplierDeductions: [supplierDeductionSchema],

    // Roll-up state — maintained by pre-save hook
    overallStatus: {
      type: String,
      enum: ['pending', 'in_progress', 'completed'],
      default: 'pending',
      index: true,
    },
    completedAt: { type: Date },

    notes: { type: String },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },

    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date },
    deletedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

// One open clearance per driver (soft-delete friendly)
driverClearanceSchema.index(
  { driverId: 1, isDeleted: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false } }
);

const isDone = (sub) => sub && ['received', 'waived', 'not_applicable'].includes(sub.status);
const isStarted = (sub) => sub && sub.status && sub.status !== 'pending';

driverClearanceSchema.methods.recomputeOverallStatus = function () {
  const client = this.clientClearance || {};
  const supplier = this.supplierClearance || {};
  const internal = this.internalClearance || {};

  const allDone = isDone(client) && isDone(supplier) && isDone(internal);
  const anyStarted = isStarted(client) || isStarted(supplier) || isStarted(internal);

  if (allDone) {
    this.overallStatus = 'completed';
    if (!this.completedAt) this.completedAt = new Date();
  } else if (anyStarted) {
    this.overallStatus = 'in_progress';
    this.completedAt = undefined;
  } else {
    this.overallStatus = 'pending';
    this.completedAt = undefined;
  }
};

driverClearanceSchema.pre('save', function (next) {
  this.recomputeOverallStatus();
  next();
});

// Auto-generate clearanceNo: CLR-YYYY-XXXXX
driverClearanceSchema.pre('save', async function (next) {
  if (this.clearanceNo) return next();

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
    'driver_clearance_no',
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );

  const yyyy = new Date().getFullYear();
  this.clearanceNo = `CLR-${yyyy}-${String(counter.seq).padStart(5, '0')}`;
  next();
});

const DriverClearance = mongoose.model('DriverClearance', driverClearanceSchema);
module.exports = DriverClearance;
module.exports.schema = driverClearanceSchema;
