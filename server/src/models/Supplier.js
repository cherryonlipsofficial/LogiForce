const mongoose = require('mongoose');

const supplierSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Supplier name is required'],
      trim: true,
    },
    serviceType: {
      type: String,
      enum: ['Lease only', 'Full fleet', 'Lease + maintenance', 'Driver-owned'],
    },
    monthlyRate: {
      type: String,
    },
    paymentTerms: {
      type: String,
    },
    contactName: {
      type: String,
    },
    contactEmail: {
      type: String,
    },
    contactPhone: {
      type: String,
    },
    vehicleCount: {
      type: Number,
      default: 0,
    },
    driverCount: {
      type: Number,
      default: 0,
    },
    contractEnd: {
      type: String,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Supplier', supplierSchema);
