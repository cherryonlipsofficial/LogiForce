const mongoose = require('mongoose');
const { Schema } = mongoose;

const guaranteePassportSchema = new Schema({

  // The driver this guarantee belongs to
  driverId: {
    type: Schema.Types.ObjectId,
    ref: 'Driver',
    required: true,
    index: true,
  },

  // Guarantor details
  guarantorName: {
    type: String,
    required: true,
    trim: true,
  },
  guarantorRelation: {
    type: String,
    required: true,
    // e.g. 'colleague', 'friend', 'family', 'other_employee'
  },
  guarantorPhone: { type: String },
  guarantorEmployeeCode: { type: String }, // if guarantor is another driver/employee

  // Passport details
  guarantorPassportNumber: {
    type: String,
    required: true,
    trim: true,
  },
  guarantorPassportExpiry: { type: Date },
  guarantorPassportCopy:   { type: String }, // file key / S3 path

  // Period
  submittedDate: {
    type: Date,
    required: true,
    default: Date.now,
  },
  expiryDate: {
    type: Date,
    required: true,
    // Always set to submittedDate + 30 days (enforced in pre-save hook)
  },

  // Extension tracking
  originalExpiryDate: { type: Date },  // stores original before any extension
  extensionCount: { type: Number, default: 0 },
  maxExtensionDays: { type: Number, default: 30 }, // per extension

  // Status
  status: {
    type: String,
    enum: ['active', 'expired', 'extended', 'replaced', 'returned'],
    default: 'active',
    index: true,
  },

  // If 'returned' — when the guarantee was given back
  returnedDate: { type: Date },
  returnedBy:   { type: Schema.Types.ObjectId, ref: 'User' },
  returnNotes:  { type: String },

  // Extension request (pending admin approval)
  extensionRequest: {
    requestedBy:    { type: Schema.Types.ObjectId, ref: 'User' },
    requestedAt:    { type: Date },
    requestedDays:  { type: Number }, // how many extra days requested
    reason:         { type: String },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
    },
    reviewedBy:  { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedAt:  { type: Date },
    reviewNotes: { type: String },
    // New expiry if approved
    newExpiryDate: { type: Date },
  },

  // Who recorded this guarantee
  submittedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },

}, { timestamps: true });

// Pre-save: enforce expiryDate = submittedDate + 30 days on creation
guaranteePassportSchema.pre('save', function (next) {
  if (this.isNew) {
    this.originalExpiryDate = this.expiryDate;
    if (!this.expiryDate) {
      const expiry = new Date(this.submittedDate);
      expiry.setDate(expiry.getDate() + 30);
      this.expiryDate = expiry;
      this.originalExpiryDate = this.expiryDate;
    }
  }
  next();
});

// Virtual: days remaining until expiry
guaranteePassportSchema.virtual('daysRemaining').get(function () {
  if (!this.expiryDate) return null;
  const diff = new Date(this.expiryDate) - new Date();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
});

// Virtual: is currently valid
guaranteePassportSchema.virtual('isValid').get(function () {
  return this.status === 'active' || this.status === 'extended';
});

guaranteePassportSchema.index({ driverId: 1, status: 1 });
guaranteePassportSchema.index({ expiryDate: 1, status: 1 }); // for expiry checks

module.exports = mongoose.model('GuaranteePassport', guaranteePassportSchema);
