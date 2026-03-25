const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const projectSchema = new Schema(
  {
    projectCode: {
      type: String,
      unique: true,
      trim: true,
    },
    name: {
      type: String,
      required: [true, 'Project name is required'],
      trim: true,
    },
    description: {
      type: String,
    },
    // Ownership
    clientId: {
      type: Schema.Types.ObjectId,
      ref: 'Client',
      required: [true, 'Client is required'],
      index: true,
    },
    // Rate charged to client per driver per month for THIS project
    ratePerDriver: {
      type: Number,
      required: [true, 'Rate per driver is required'],
    },
    rateBasis: {
      type: String,
      enum: ['monthly_fixed', 'daily_rate', 'per_trip'],
      default: 'monthly_fixed',
    },
    currency: {
      type: String,
      default: 'AED',
    },
    // Operations contact
    operationsContactName: { type: String },
    operationsContactPhone: { type: String },
    operationsContactEmail: { type: String },
    // Location / scope
    location: { type: String },
    serviceType: { type: String },
    // Status
    status: {
      type: String,
      enum: ['active', 'on_hold', 'completed', 'cancelled'],
      default: 'active',
      index: true,
    },
    // Headcount
    plannedDriverCount: {
      type: Number,
      default: 0,
    },
    // Timestamps & audit
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Auto-generate projectCode before save (same counter pattern as Driver.employeeCode)
projectSchema.pre('save', async function (next) {
  if (this.projectCode) return next();

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
    'projectCode',
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );

  this.projectCode = `PRJ-${String(counter.seq).padStart(5, '0')}`;
  next();
});

// Virtual: get active driver count
projectSchema.virtual('driverCount', {
  ref: 'Driver',
  localField: '_id',
  foreignField: 'projectId',
  count: true,
});

projectSchema.index({ clientId: 1, status: 1 });
projectSchema.index({ clientId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('Project', projectSchema);
