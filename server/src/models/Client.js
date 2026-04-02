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
    address: {
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

const Client = mongoose.model('Client', clientSchema);
module.exports = Client;
module.exports.schema = clientSchema;
