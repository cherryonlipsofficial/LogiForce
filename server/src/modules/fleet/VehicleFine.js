const mongoose = require('mongoose');
const { Schema } = mongoose;

const vehicleFineSchema = new Schema(
  {
    vehicleId: { type: Schema.Types.ObjectId, ref: 'Vehicle', required: true, index: true },
    driverId: { type: Schema.Types.ObjectId, ref: 'Driver', index: true, default: null },
    vehicleAssignmentId: { type: Schema.Types.ObjectId, ref: 'VehicleAssignment', default: null },
    fineType: {
      type: String,
      enum: ['traffic_fine', 'salik', 'parking_fine', 'damage', 'rta_fine', 'other'],
      required: true,
      index: true,
    },
    amount: { type: Number, required: true, min: 0 },
    fineDate: { type: Date, required: true, index: true },
    description: { type: String, trim: true },
    referenceNumber: { type: String, trim: true },
    status: {
      type: String,
      enum: ['pending', 'deducted', 'disputed', 'waived', 'unassigned'],
      default: 'pending',
      index: true,
    },
    salaryRunId: { type: Schema.Types.ObjectId, ref: 'SalaryRun', default: null },
    deductionPeriod: {
      year: Number,
      month: Number,
    },
    disputeReason: String,
    disputeResolvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    disputeResolvedAt: Date,
    waivedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    waivedAt: Date,
    waiverReason: String,
    // Denormalized
    vehiclePlate: String,
    driverName: String,
    driverEmployeeCode: String,
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    notes: String,
  },
  { timestamps: true }
);

vehicleFineSchema.index({ driverId: 1, status: 1 });
vehicleFineSchema.index({ 'deductionPeriod.year': 1, 'deductionPeriod.month': 1 });

const VehicleFine = mongoose.model('VehicleFine', vehicleFineSchema);
module.exports = VehicleFine;
module.exports.schema = vehicleFineSchema;
