const mongoose = require('mongoose');

const vehicleSchema = new mongoose.Schema(
  {
    plate: {
      type: String,
      required: [true, 'Plate number is required'],
      unique: true,
      trim: true,
    },
    make: {
      type: String,
      trim: true,
    },
    model: {
      type: String,
      trim: true,
    },
    year: {
      type: Number,
    },
    color: {
      type: String,
      trim: true,
    },
    vehicleType: {
      type: String,
      enum: ['Sedan', 'SUV', 'Van', 'Pickup', 'Motorcycle', 'Truck', 'Other'],
      default: 'Sedan',
    },
    supplierId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Supplier',
      default: null,
    },
    assignedDriverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Driver',
      default: null,
    },
    currentDriverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Driver',
      default: null,
    },
    currentAssignmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'VehicleAssignment',
      default: null,
    },
    status: {
      type: String,
      enum: ['available', 'assigned', 'maintenance', 'off_hired', 'reserved'],
      default: 'available',
      index: true,
    },
    monthlyRate: {
      type: Number,
      default: 0,
    },
    contractStart: {
      type: Date,
    },
    contractEnd: {
      type: Date,
    },
    mulkiyaExpiry: {
      type: Date,
    },
    insuranceExpiry: {
      type: Date,
    },
    ownVehicle: {
      type: Boolean,
      default: false,
    },
    notes: {
      type: String,
    },
    offHireReason: {
      type: String,
    },
    offHireDate: {
      type: Date,
    },
    chassisNumber: { type: String, trim: true },
    engineNumber: { type: String, trim: true },
    leaseType: {
      type: String,
      enum: ['rental', 'yearly_lease', 'owned', 'driver_owned'],
      default: 'rental',
    },
    contractDurationMonths: { type: Number },
    contractNumber: { type: String, trim: true },
    depositAmount: { type: Number, default: 0 },
    earlyTerminationPenalty: { type: Number, default: 0 },
    penaltyPerDay: { type: Number, default: 0 },
    minimumContractMonths: { type: Number, default: 0 },
    registrationExpiry: { type: Date },
    offHirePenaltyAmount: { type: Number, default: 0 },
    offHireBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    currentMileage: { type: Number, default: 0 },
    mileageUnit: { type: String, enum: ['km', 'miles'], default: 'km' },
    fuelType: {
      type: String,
      enum: ['petrol', 'diesel', 'electric', 'hybrid', 'cng', 'other'],
      default: 'petrol',
    },
    totalAssignments: { type: Number, default: 0 },
    totalIdleDays: { type: Number, default: 0 },
    lastIdleSince: { type: Date, default: null },
    totalFinesAmount: { type: Number, default: 0 },
    totalFinesCount: { type: Number, default: 0 },
  },
  {
    timestamps: true,
  }
);

vehicleSchema.index({ status: 1 });
vehicleSchema.index({ supplierId: 1 });
vehicleSchema.index({ assignedDriverId: 1 });
vehicleSchema.index({ leaseType: 1 });
vehicleSchema.index({ contractEnd: 1 });
vehicleSchema.index({ mulkiyaExpiry: 1 });
vehicleSchema.index({ insuranceExpiry: 1 });

const Vehicle = mongoose.model('Vehicle', vehicleSchema);
module.exports = Vehicle;
module.exports.schema = vehicleSchema;
