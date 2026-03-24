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
    status: {
      type: String,
      enum: ['available', 'assigned', 'maintenance', 'off_hired', 'reserved'],
      default: 'available',
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
  },
  {
    timestamps: true,
  }
);

vehicleSchema.index({ plate: 1 });
vehicleSchema.index({ status: 1 });
vehicleSchema.index({ supplierId: 1 });
vehicleSchema.index({ assignedDriverId: 1 });

module.exports = mongoose.model('Vehicle', vehicleSchema);
