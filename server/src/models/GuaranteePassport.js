const mongoose = require('mongoose');

const guaranteePassportSchema = new mongoose.Schema(
  {
    driverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Driver',
      required: true,
      index: true,
    },
    guarantorName: {
      type: String,
      required: true,
      trim: true,
    },
    guarantorRelation: {
      type: String,
      required: true,
      trim: true,
    },
    guarantorPhone: {
      type: String,
      trim: true,
    },
    guarantorEmployeeCode: {
      type: String,
      trim: true,
    },
    guarantorPassportNumber: {
      type: String,
      required: true,
      trim: true,
    },
    guarantorPassportExpiry: {
      type: Date,
    },
    guarantorPassportCopy: {
      type: String, // file key
    },
    submittedDate: {
      type: Date,
      default: () => new Date(),
    },
    expiryDate: {
      type: Date,
    },
    status: {
      type: String,
      enum: ['active', 'extended', 'expired', 'returned', 'replaced'],
      default: 'active',
      index: true,
    },
    submittedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    returnedDate: {
      type: Date,
    },
    returnedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    returnNotes: {
      type: String,
    },
    extensionCount: {
      type: Number,
      default: 0,
    },
    extensionRequest: {
      requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      requestedAt: { type: Date },
      requestedDays: { type: Number },
      reason: { type: String },
      status: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
      },
      newExpiryDate: { type: Date },
      reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      reviewedAt: { type: Date },
      reviewNotes: { type: String },
    },
  },
  {
    timestamps: true,
  }
);

// Auto-set expiryDate to submittedDate + 30 days on creation
guaranteePassportSchema.pre('save', function (next) {
  if (this.isNew && !this.expiryDate) {
    const expiry = new Date(this.submittedDate || Date.now());
    expiry.setDate(expiry.getDate() + 30);
    this.expiryDate = expiry;
  }
  next();
});

module.exports = mongoose.model('GuaranteePassport', guaranteePassportSchema);
