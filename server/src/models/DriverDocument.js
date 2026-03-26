const mongoose = require('mongoose');

const driverDocumentSchema = new mongoose.Schema(
  {
    driverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Driver',
      required: true,
    },
    docType: {
      type: String,
      enum: [
        'emirates_id',
        'passport',
        'visa',
        'labour_card',
        'driving_licence',
        'mulkiya',
        'other',
      ],
      required: true,
    },
    fileKey: {
      type: String,
    },
    fileUrl: {
      type: String,
    },
    originalName: {
      type: String,
    },
    contentType: {
      type: String,
    },
    fileData: {
      type: Buffer,
    },
    fileSize: {
      type: Number,
    },
    expiryDate: {
      type: Date,
    },
    status: {
      type: String,
      enum: ['pending', 'verified', 'rejected', 'expired'],
      default: 'pending',
    },
    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    verifiedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('DriverDocument', driverDocumentSchema);
