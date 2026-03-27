const mongoose = require('mongoose');
const { Schema } = mongoose;

const vehicleAssignmentSchema = new Schema(
  {
    // Core references
    vehicleId: {
      type: Schema.Types.ObjectId,
      ref: 'Vehicle',
      required: true,
      index: true,
    },
    driverId: {
      type: Schema.Types.ObjectId,
      ref: 'Driver',
      required: true,
      index: true,
    },

    // Denormalized at time of assignment for historical accuracy
    clientId: {
      type: Schema.Types.ObjectId,
      ref: 'Client',
    },
    projectId: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
    },
    vehiclePlateNumber: { type: String },
    vehicleMakeModel: { type: String },
    driverName: { type: String },
    driverEmployeeCode: { type: String },

    // Assignment details
    assignedDate: {
      type: Date,
      required: true,
      default: Date.now,
    },
    expectedReturnDate: { type: Date },
    returnedDate: { type: Date },

    // Monthly deduction amount locked at assignment time
    monthlyDeductionAmount: {
      type: Number,
      default: 0,
    },

    // Assignment status
    status: {
      type: String,
      enum: ['active', 'returned'],
      default: 'active',
      index: true,
    },

    // Return details (filled when vehicle is returned)
    returnCondition: {
      type: String,
      enum: ['good', 'minor_damage', 'major_damage', 'total_loss'],
    },
    damageNotes: { type: String },
    damagePenaltyAmount: { type: Number, default: 0 },

    // Who performed each action
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

// Compound index: fast lookup of active assignment for a vehicle
vehicleAssignmentSchema.index({ vehicleId: 1, status: 1 });

// Compound index: fast lookup of active assignment for a driver
vehicleAssignmentSchema.index({ driverId: 1, status: 1 });

// Compound index: history queries (all assignments for a vehicle)
vehicleAssignmentSchema.index({ vehicleId: 1, assignedDate: -1 });

// Compound index: history queries (all assignments for a driver)
vehicleAssignmentSchema.index({ driverId: 1, assignedDate: -1 });

module.exports = mongoose.model('VehicleAssignment', vehicleAssignmentSchema);
