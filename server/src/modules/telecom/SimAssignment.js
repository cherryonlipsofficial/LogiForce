const mongoose = require('mongoose');
const { Schema } = mongoose;

const simAssignmentSchema = new Schema(
  {
    simId: {
      type: Schema.Types.ObjectId,
      ref: 'TelecomSim',
      required: true,
      index: true,
    },
    driverId: {
      type: Schema.Types.ObjectId,
      ref: 'Driver',
      required: true,
      index: true,
    },

    // Denormalized at assignment time
    simNumber: { type: String },
    driverName: { type: String },
    driverEmployeeCode: { type: String },

    assignedDate: {
      type: Date,
      required: true,
      default: Date.now,
    },
    returnedDate: { type: Date },

    status: {
      type: String,
      enum: ['active', 'returned'],
      default: 'active',
    },

    assignedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    assignedByName: { type: String },

    returnedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    returnedByName: { type: String },

    notes: { type: String },
  },
  {
    timestamps: true,
  }
);

simAssignmentSchema.index({ simId: 1, status: 1 });
simAssignmentSchema.index({ driverId: 1, status: 1 });
simAssignmentSchema.index({ simId: 1, assignedDate: -1 });

const SimAssignment = mongoose.model('SimAssignment', simAssignmentSchema);
module.exports = SimAssignment;
module.exports.schema = simAssignmentSchema;
