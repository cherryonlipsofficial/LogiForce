const mongoose = require('mongoose');

const driverSchema = new mongoose.Schema(
  {
    employeeCode: {
      type: String,
      unique: true,
      trim: true,
    },
    fullName: {
      type: String,
      trim: true,
    },
    fullNameArabic: {
      type: String,
      trim: true,
    },
    nationality: {
      type: String,
    },
    emiratesId: {
      type: String,
      unique: true,
      sparse: true,
    },
    emiratesIdExpiry: {
      type: Date,
    },
    passportNumber: {
      type: String,
      unique: true,
      sparse: true,
    },
    passportExpiry: {
      type: Date,
    },
    visaNumber: {
      type: String,
    },
    visaType: {
      type: String,
      enum: ['employment', 'investor', 'family', 'visit'],
    },
    visaExpiry: {
      type: Date,
    },
    labourCardNo: {
      type: String,
    },
    labourCardExpiry: {
      type: Date,
    },
    drivingLicenceExpiry: {
      type: Date,
    },
    mulkiyaExpiry: {
      type: Date,
    },
    phoneUae: {
      type: String,
      unique: true,
      sparse: true,
    },
    phoneHomeCountry: {
      type: String,
    },
    bankName: {
      type: String,
    },
    iban: {
      type: String,
    },
    vehicleType: {
      type: String,
    },
    vehiclePlate: {
      type: String,
    },
    ownVehicle: {
      type: Boolean,
      default: false,
    },
    baseSalary: {
      type: Number,
    },
    payStructure: {
      type: String,
      enum: ['MONTHLY_FIXED', 'DAILY_RATE', 'PER_ORDER'],
    },
    status: {
      type: String,
      enum: [
        'draft',               // Created by sales team
        'pending_kyc',         // Profile & Employment fields completed (auto)
        'pending_verification',// All KYC docs uploaded and valid (auto)
        'active',              // Activated manually by compliance
        'on_leave',            // Manual by operations
        'suspended',           // Manual by operations
        'resigned',            // Manual by operations
        'offboarded',          // Manual by operations
      ],
      default: 'draft',
      index: true,
    },
    // Set by Operations team after verification
    clientUserId: {
      type: String,
      sparse: true,
      index: true,
      // e.g. the ID the client (Amazon, Noon) uses for this driver
    },

    // Contact details for Pending Verification step
    emergencyContactName:   { type: String },
    emergencyContactPhone:  { type: String },
    emergencyContactRelation: { type: String },
    alternatePhone:         { type: String },
    homeCountryPhone:       { type: String },
    homeCountryAddress:     { type: String },

    // Tracks whether Compliance has clicked "Verified" on contacts
    contactsVerified:       { type: Boolean, default: false },
    contactsVerifiedBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    contactsVerifiedAt:     { type: Date },

    // Tracks whether driver was manually activated from pending_verification
    activatedManually:      { type: Boolean, default: false },

    // Tracks whether Compliance has confirmed personal verification of the driver
    personalVerificationDone:  { type: Boolean, default: false },
    personalVerificationBy:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    personalVerificationAt:    { type: Date },

    // Tracks who last changed the status and why
    lastStatusChange: {
      from:      { type: String },
      to:        { type: String },
      reason:    { type: String },
      changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      changedAt: { type: Date },
    },

    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Client',
      default: null,
    },
    supplierId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Supplier',
      default: null,
    },
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      index: true,
    },
    currentProjectAssignmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DriverProjectAssignment',
      default: null,
    },
    currentVehicleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vehicle',
      default: null,
    },
    currentVehicleAssignmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'VehicleAssignment',
      default: null,
    },
    telecomSimId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TelecomSim',
      default: null,
    },

    // Passport submission tracking
    isPassportSubmitted: {
      type: Boolean,
      default: false,
    },
    passportSubmissionType: {
      type: String,
      enum: ['own', 'guarantee', null],
      default: null,
    },
    activeGuaranteePassportId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'GuaranteePassport',
      default: null,
    },
    guaranteePassportValid: {
      type: Boolean,
      default: null,
    },
    joinDate: {
      type: Date,
    },
    contractEndDate: {
      type: Date,
    },
    // ── Passport submission ──
    isPassportSubmitted: {
      type: Boolean,
      default: false,
      index: true,
    },

    // 'own'       = driver submitted their own passport
    // 'guarantee' = a guarantor submitted their passport on driver's behalf
    // null        = not yet submitted
    passportSubmissionType: {
      type: String,
      enum: ['own', 'guarantee', null],
      default: null,
    },

    // Set when passportSubmissionType = 'guarantee'
    // References the active GuaranteePassport record
    activeGuaranteePassportId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'GuaranteePassport',
      default: null,
    },

    // Denormalized flag — true if guarantee passport is currently valid
    // Updated by the nightly expiry checker
    guaranteePassportValid: {
      type: Boolean,
      default: null,  // null = no guarantee involved
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
);

// Auto-generate employeeCode before save
driverSchema.pre('save', async function (next) {
  if (this.employeeCode) return next();

  const Counter =
    mongoose.models.Counter ||
    mongoose.model(
      'Counter',
      new mongoose.Schema({
        _id: { type: String, required: true },
        seq: { type: Number, default: 0 },
      })
    );

  const counter = await Counter.findByIdAndUpdate(
    'driver_employee_code',
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );

  this.employeeCode = `DRV-${String(counter.seq).padStart(5, '0')}`;
  next();
});

driverSchema.index({ clientId: 1 });

const Driver = mongoose.model('Driver', driverSchema);
module.exports = Driver;
module.exports.schema = driverSchema;
