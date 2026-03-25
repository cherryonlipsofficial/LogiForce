const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const driverProjectAssignmentSchema = new Schema(
  {
    driverId: {
      type: Schema.Types.ObjectId,
      ref: 'Driver',
      required: [true, 'Driver is required'],
      index: true,
    },
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
    contractId: {
      type: Schema.Types.ObjectId,
      ref: 'ProjectContract',
    },
    // Rate at time of assignment (snapshot)
    ratePerDriver: {
      type: Number,
      required: [true, 'Rate per driver is required'],
    },
    assignedDate: {
      type: Date,
      required: true,
      default: Date.now,
    },
    unassignedDate: {
      type: Date,
    },
    status: {
      type: String,
      enum: ['active', 'completed', 'terminated'],
      default: 'active',
    },
    reason: { type: String },
    assignedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    closedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
);

// Quickly find active assignment for a driver
driverProjectAssignmentSchema.index({ driverId: 1, status: 1 });
// All active drivers on a project
driverProjectAssignmentSchema.index({ projectId: 1, status: 1 });

module.exports = mongoose.model('DriverProjectAssignment', driverProjectAssignmentSchema);
