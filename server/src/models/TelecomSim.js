const mongoose = require('mongoose');
const { Schema } = mongoose;

const telecomSimSchema = new Schema(
  {
    simNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    operator: {
      type: String,
      default: 'etisalat',
      enum: ['etisalat', 'du', 'virgin'],
    },
    plan: { type: String },
    monthlyPlanCost: { type: Number },
    accountNumber: { type: String },
    accountOwner: { type: String },
    status: {
      type: String,
      enum: ['active', 'idle', 'suspended', 'terminated'],
      default: 'active',
    },
    currentDriverId: {
      type: Schema.Types.ObjectId,
      ref: 'Driver',
      default: null,
    },
    currentAssignmentId: {
      type: Schema.Types.ObjectId,
      ref: 'SimAssignment',
      default: null,
    },
    notes: { type: String },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
);

telecomSimSchema.index({ status: 1 });
telecomSimSchema.index({ currentDriverId: 1 });

const TelecomSim = mongoose.model('TelecomSim', telecomSimSchema);
module.exports = TelecomSim;
module.exports.schema = telecomSimSchema;
