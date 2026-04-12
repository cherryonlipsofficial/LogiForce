const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const projectContractSchema = new Schema(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
      required: [true, 'Project is required'],
      index: true,
    },
    clientId: {
      type: Schema.Types.ObjectId,
      ref: 'Client',
      required: [true, 'Client is required'],
    },
    contractNumber: {
      type: String,
      unique: true,
      sparse: true,
    },
    // Duration
    contractType: {
      type: String,
      enum: ['monthly', 'quarterly', 'six_months', 'one_year', 'two_years', 'three_years', 'custom'],
      required: [true, 'Contract type is required'],
    },
    durationMonths: {
      type: Number,
      required: [true, 'Duration in months is required'],
    },
    startDate: {
      type: Date,
      required: [true, 'Start date is required'],
    },
    endDate: {
      type: Date,
      required: [true, 'End date is required'],
    },
    // Rate — snapshot at time of contract signing
    ratePerDriver: {
      type: Number,
      required: [true, 'Rate per driver is required'],
    },
    rateBasis: {
      type: String,
      enum: ['monthly_fixed', 'daily_rate', 'per_order'],
    },
    // Headcount bounds
    minDrivers: {
      type: Number,
      default: 0,
    },
    maxDrivers: {
      type: Number,
    },
    // Status
    status: {
      type: String,
      enum: ['draft', 'active', 'expired', 'terminated', 'renewed'],
      default: 'draft',
    },
    // Renewal chain
    renewedFromContractId: {
      type: Schema.Types.ObjectId,
      ref: 'ProjectContract',
    },
    renewedToContractId: {
      type: Schema.Types.ObjectId,
      ref: 'ProjectContract',
    },
    // Termination
    terminationDate: { type: Date },
    terminationReason: { type: String },
    // Notes
    notes: { type: String },
    documentUrl: { type: String },
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

// Pre-save: compute endDate from startDate + durationMonths if not explicitly set
projectContractSchema.pre('save', function (next) {
  if (this.isNew && !this.endDate && this.startDate && this.durationMonths) {
    const end = new Date(this.startDate);
    end.setMonth(end.getMonth() + this.durationMonths);
    this.endDate = end;
  }
  next();
});

// Virtual: days until expiry
projectContractSchema.virtual('daysUntilExpiry').get(function () {
  if (!this.endDate) return null;
  return Math.ceil((this.endDate - new Date()) / (1000 * 60 * 60 * 24));
});

projectContractSchema.index({ projectId: 1, status: 1 });
projectContractSchema.index({ endDate: 1, status: 1 });

const ProjectContract = mongoose.model('ProjectContract', projectContractSchema);
module.exports = ProjectContract;
module.exports.schema = projectContractSchema;
