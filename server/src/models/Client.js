const mongoose = require('mongoose');

const clientSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Client name is required'],
      unique: true,
      trim: true,
    },
    tradeLicenceNo: {
      type: String,
    },
    vatNo: {
      type: String,
    },
    billingCurrency: {
      type: String,
      default: 'AED',
    },
    ratePerDriver: {
      type: Number,
      // DEPRECATED: Rate now lives on Project. Kept for backward compatibility.
      // New projects should set rate on the Project model instead.
    },
    paymentTerms: {
      type: String,
      default: 'Net 30',
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
    kycRules: {
      requireEmiratesId: { type: Boolean, default: true },
      requirePassport: { type: Boolean, default: true },
      requireVisa: { type: Boolean, default: true },
      requireLabourCard: { type: Boolean, default: true },
      gracePeriodDays: { type: Number, default: 0 },
    },
    contractStart: {
      type: Date,
    },
    contractEnd: {
      type: Date,
    },
    contractFile: {
      data: { type: Buffer },
      contentType: { type: String },
      originalName: { type: String },
      size: { type: Number },
      uploadedAt: { type: Date },
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

module.exports = mongoose.model('Client', clientSchema);
