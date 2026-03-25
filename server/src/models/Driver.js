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
      required: [true, 'Full name is required'],
      trim: true,
    },
    fullNameArabic: {
      type: String,
      trim: true,
    },
    nationality: {
      type: String,
      required: [true, 'Nationality is required'],
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
      required: [true, 'UAE phone number is required'],
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
      required: [true, 'Base salary is required'],
    },
    payStructure: {
      type: String,
      enum: ['MONTHLY_FIXED', 'DAILY_RATE', 'PER_TRIP'],
      required: [true, 'Pay structure is required'],
    },
    status: {
      type: String,
      enum: [
        'draft',
        'pending_kyc',
        'active',
        'on_leave',
        'suspended',
        'resigned',
        'offboarding',
      ],
      default: 'draft',
    },
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Client',
      required: [true, 'Client is required'],
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
      default: null,
    },
    currentProjectAssignmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DriverProjectAssignment',
      default: null,
    },
    telecomSimId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TelecomSim',
      default: null,
    },
    joinDate: {
      type: Date,
    },
    contractEndDate: {
      type: Date,
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
driverSchema.index({ projectId: 1 });
driverSchema.index({ status: 1 });
driverSchema.index({ emiratesId: 1 });
driverSchema.index({ passportNumber: 1 });

module.exports = mongoose.model('Driver', driverSchema);
