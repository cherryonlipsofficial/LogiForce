const { Driver, DriverLedger, DriverDocument } = require('../models');
const { PAGINATION } = require('../config/constants');
const { evaluateAndTransition } = require('./driverStatusEngine.service');
const { logEvent } = require('./driverHistory.service');

const findAll = async (filters = {}, pagination = {}) => {
  const page = parseInt(pagination.page) || PAGINATION.DEFAULT_PAGE;
  const limit = parseInt(pagination.limit) || PAGINATION.DEFAULT_LIMIT;
  const skip = (page - 1) * limit;

  const query = {};

  if (filters.status) {
    query.status = filters.status;
  }
  if (filters.clientId) {
    query.clientId = filters.clientId;
  }
  if (filters.projectId) {
    query.projectId = filters.projectId;
  }
  if (filters.search) {
    query.$or = [
      { fullName: { $regex: filters.search, $options: 'i' } },
      { employeeCode: { $regex: filters.search, $options: 'i' } },
      { emiratesId: { $regex: filters.search, $options: 'i' } },
      { passportNumber: { $regex: filters.search, $options: 'i' } },
    ];
  }

  const [drivers, total] = await Promise.all([
    Driver.find(query)
      .populate('clientId', 'name')
      .populate('supplierId', 'name')
      .populate('projectId', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Driver.countDocuments(query),
  ]);

  return { drivers, total, page, limit };
};

const findById = async (id) => {
  const driver = await Driver.findById(id)
    .populate('clientId')
    .populate('supplierId')
    .populate('projectId')
    .populate('createdBy', 'name email');

  if (!driver) {
    const err = new Error('Driver not found');
    err.statusCode = 404;
    throw err;
  }
  return driver;
};

const create = async (data, userId) => {
  if (data.phoneUae) {
    const existing = await Driver.findOne({ phoneUae: data.phoneUae });
    if (existing) {
      const err = new Error('A driver with this UAE phone number already exists');
      err.statusCode = 409;
      throw err;
    }
  }

  // Driver starts as draft; status engine will auto-transition to pending_kyc
  // if all required fields are filled
  data.status = 'draft';
  data.createdBy = userId;
  const driver = await Driver.create(data);

  await logEvent(driver._id, 'driver_created', {
    description: `Driver profile created — ${driver.fullName || 'unnamed'}`,
  }, userId);

  // Evaluate auto-transition: draft → pending_kyc if all required fields present
  await evaluateAndTransition(driver._id, userId);

  return Driver.findById(driver._id);
};

// Fields to track changes for in driver history
const TRACKED_FIELDS = [
  'fullName', 'fullNameArabic', 'nationality', 'emiratesId', 'emiratesIdExpiry',
  'passportNumber', 'passportExpiry', 'visaNumber', 'visaType', 'visaExpiry',
  'labourCardNo', 'labourCardExpiry', 'drivingLicenceExpiry', 'mulkiyaExpiry',
  'phoneUae', 'phoneHomeCountry', 'bankName', 'iban',
  'vehicleType', 'vehiclePlate', 'ownVehicle', 'baseSalary', 'payStructure',
  'clientUserId', 'emergencyContactName', 'emergencyContactPhone',
  'emergencyContactRelation', 'alternatePhone', 'homeCountryPhone', 'homeCountryAddress',
  'joinDate', 'contractEndDate', 'email',
  'clientId', 'supplierId', 'projectId',
];

// Human-readable labels for field names
const FIELD_LABELS = {
  fullName: 'Full Name', fullNameArabic: 'Full Name (Arabic)', nationality: 'Nationality',
  emiratesId: 'Emirates ID', emiratesIdExpiry: 'Emirates ID Expiry',
  passportNumber: 'Passport Number', passportExpiry: 'Passport Expiry',
  visaNumber: 'Visa Number', visaType: 'Visa Type', visaExpiry: 'Visa Expiry',
  labourCardNo: 'Labour Card No', labourCardExpiry: 'Labour Card Expiry',
  drivingLicenceExpiry: 'Driving Licence Expiry', mulkiyaExpiry: 'Mulkiya Expiry',
  phoneUae: 'UAE Phone', phoneHomeCountry: 'Home Country Phone',
  bankName: 'Bank Name', iban: 'IBAN',
  vehicleType: 'Vehicle Type', vehiclePlate: 'Vehicle Plate', ownVehicle: 'Own Vehicle',
  baseSalary: 'Base Salary', payStructure: 'Pay Structure',
  clientUserId: 'Client User ID',
  emergencyContactName: 'Emergency Contact Name', emergencyContactPhone: 'Emergency Contact Phone',
  emergencyContactRelation: 'Emergency Contact Relation',
  alternatePhone: 'Alternate Phone', homeCountryPhone: 'Home Country Phone',
  homeCountryAddress: 'Home Country Address',
  joinDate: 'Join Date', contractEndDate: 'Contract End Date', email: 'Email',
  clientId: 'Client', supplierId: 'Supplier', projectId: 'Project',
};

const formatFieldValue = (value) => {
  if (value === null || value === undefined || value === '') return '(empty)';
  if (value instanceof Date) return value.toISOString().split('T')[0];
  if (typeof value === 'object' && value._id) return value.name || String(value._id);
  return String(value);
};

const update = async (id, data, userId, { isAdmin = false, canEditActive = false } = {}) => {
  const existing = await Driver.findById(id)
    .populate('clientId', 'name')
    .populate('supplierId', 'name')
    .populate('projectId', 'name');
  if (!existing) {
    const err = new Error('Driver not found');
    err.statusCode = 404;
    throw err;
  }
  if (existing.status === 'active' && !isAdmin && !canEditActive) {
    const err = new Error('You do not have permission to edit an active driver');
    err.statusCode = 403;
    throw err;
  }

  if (data.phoneUae) {
    const duplicate = await Driver.findOne({ phoneUae: data.phoneUae, _id: { $ne: id } });
    if (duplicate) {
      const err = new Error('A driver with this UAE phone number already exists');
      err.statusCode = 409;
      throw err;
    }
  }

  // Detect changed fields before updating
  const changedFields = [];
  for (const field of TRACKED_FIELDS) {
    if (data[field] === undefined) continue;
    const oldVal = existing[field];
    const newVal = data[field];
    const oldStr = formatFieldValue(oldVal);
    const newStr = formatFieldValue(newVal);
    if (oldStr !== newStr) {
      changedFields.push({ field, oldValue: oldStr, newValue: newStr });
    }
  }

  const driver = await Driver.findByIdAndUpdate(id, data, {
    new: true,
    runValidators: true,
  });

  // Log each field change to history
  for (const change of changedFields) {
    const label = FIELD_LABELS[change.field] || change.field;
    await logEvent(id, 'field_updated', {
      fieldName: change.field,
      oldValue: change.oldValue,
      newValue: change.newValue,
      description: `${label} changed from "${change.oldValue}" to "${change.newValue}"`,
    }, userId);
  }

  // Sync expiry dates from Driver fields to corresponding DriverDocument records
  const expiryMapping = [
    { docType: 'passport', field: 'passportExpiry' },
    { docType: 'emirates_id', field: 'emiratesIdExpiry' },
    { docType: 'driving_licence', field: 'drivingLicenceExpiry' },
    { docType: 'visa', field: 'visaExpiry' },
    { docType: 'labour_card', field: 'labourCardExpiry' },
  ];
  for (const { docType, field } of expiryMapping) {
    if (data[field]) {
      await DriverDocument.updateOne(
        { driverId: id, docType },
        { expiryDate: data[field] },
      );
    }
  }

  await evaluateAndTransition(id, userId);

  return driver;
};

const softDelete = async (id, userId) => {
  const existing = await Driver.findById(id);
  if (!existing) {
    const err = new Error('Driver not found');
    err.statusCode = 404;
    throw err;
  }

  const oldStatus = existing.status;
  const driver = await Driver.findByIdAndUpdate(
    id,
    { status: 'resigned' },
    { new: true }
  );

  if (userId) {
    await logEvent(id, 'driver_deleted', {
      description: `Driver offboarded — status changed from ${oldStatus} to resigned`,
      statusFrom: oldStatus,
      statusTo: 'resigned',
    }, userId);
  }

  return driver;
};

const getLedger = async (driverId, pagination = {}) => {
  const page = parseInt(pagination.page) || PAGINATION.DEFAULT_PAGE;
  const limit = parseInt(pagination.limit) || PAGINATION.DEFAULT_LIMIT;
  const skip = (page - 1) * limit;

  const [entries, total] = await Promise.all([
    DriverLedger.find({ driverId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('createdBy', 'name'),
    DriverLedger.countDocuments({ driverId }),
  ]);

  return { entries, total, page, limit };
};

const getExpiringDocuments = async (days = 30) => {
  const now = new Date();
  const threshold = new Date();
  threshold.setDate(threshold.getDate() + days);

  const docs = await DriverDocument.find({
    expiryDate: { $gte: now, $lte: threshold },
    status: { $ne: 'expired' },
  }).populate('driverId', 'fullName employeeCode clientId status');

  return docs;
};

const getStatusCounts = async () => {
  const [total, active, onLeave, suspended, resigned] = await Promise.all([
    Driver.countDocuments({}),
    Driver.countDocuments({ status: 'active' }),
    Driver.countDocuments({ status: 'on_leave' }),
    Driver.countDocuments({ status: 'suspended' }),
    Driver.countDocuments({ status: 'resigned' }),
  ]);
  return { total, active, onLeave, suspended, resigned };
};

const bulkCreate = async (rows, userId) => {
  const { Project } = require('../models');
  const { evaluateAndTransition } = require('./driverStatusEngine.service');
  const results = { created: 0, errors: [] };

  // Helper to safely convert any value to trimmed string (XLSX may return numbers)
  const str = (val) => (val == null ? '' : String(val).trim());

  // Helper to expand scientific notation strings (e.g. "9.72E+11") back to full numbers
  const expandNumber = (val) => {
    const s = str(val);
    if (/^[+-]?\d+(\.\d+)?[eE][+-]?\d+$/.test(s)) {
      const num = Number(s);
      if (Number.isFinite(num)) return BigInt(Math.round(num)).toString();
    }
    return s;
  };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2; // +2 for 1-indexed + header row
    try {
      const fullName = str(row.fullName);
      const nationality = str(row.nationality);
      const phoneUae = expandNumber(row.phoneUae);
      const baseSalary = str(row.baseSalary);
      const payStructure = str(row.payStructure);
      const projectRef = str(row.project);

      const emiratesId = expandNumber(row.emiratesId);
      const joinDate = str(row.joinDate);

      // Check for duplicate phone number if provided
      if (phoneUae) {
        const existingPhone = await Driver.findOne({ phoneUae: phoneUae });
        if (existingPhone) throw new Error(`UAE phone number ${phoneUae} already exists`);
      }

      // Validate payStructure if provided
      if (payStructure && !['MONTHLY_FIXED', 'DAILY_RATE', 'PER_TRIP'].includes(payStructure)) {
        throw new Error('Pay structure must be MONTHLY_FIXED, DAILY_RATE, or PER_TRIP');
      }

      // Resolve project by name or ID if provided
      let projectId = null;
      if (projectRef) {
        if (!projectRef.match(/^[0-9a-fA-F]{24}$/)) {
          const project = await Project.findOne({ name: { $regex: new RegExp(`^${projectRef.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } });
          if (!project) throw new Error(`Project "${projectRef}" not found`);
          projectId = project._id;
        } else {
          projectId = projectRef;
        }
      }

      // Build driver data — missing fields will leave driver in Draft status
      const driverData = {
        status: 'draft',
        createdBy: userId,
      };
      if (fullName) driverData.fullName = fullName;
      if (nationality) driverData.nationality = nationality;
      if (phoneUae) driverData.phoneUae = phoneUae;
      if (emiratesId) driverData.emiratesId = emiratesId;
      if (baseSalary) driverData.baseSalary = Number(baseSalary);
      if (payStructure) driverData.payStructure = payStructure;
      if (projectId) driverData.projectId = projectId;
      if (joinDate) driverData.joinDate = new Date(joinDate);

      // Optional fields
      const passportNumber = expandNumber(row.passportNumber);
      const visaNumber = expandNumber(row.visaNumber);
      const bankName = str(row.bankName);
      const iban = expandNumber(row.iban);
      const passportExpiry = str(row.passportExpiry);
      const dateOfBirth = str(row.dateOfBirth);
      const email = str(row.email);
      const homeCountryPhone = expandNumber(row.homeCountryPhone);
      const emergencyContactName = str(row.emergencyContactName);
      const emergencyContactPhone = expandNumber(row.emergencyContactPhone);
      const emergencyContactRelation = str(row.emergencyContactRelation);
      const employeeCode = str(row.employeeCode);
      const clientName = str(row.clientName);

      if (passportNumber) driverData.passportNumber = passportNumber;
      if (visaNumber) driverData.visaNumber = visaNumber;
      if (bankName) driverData.bankName = bankName;
      if (iban) driverData.iban = iban;
      if (passportExpiry) driverData.passportExpiry = new Date(passportExpiry);
      if (dateOfBirth) driverData.dateOfBirth = new Date(dateOfBirth);
      if (email) driverData.email = email;
      if (homeCountryPhone) driverData.homeCountryPhone = homeCountryPhone;
      if (emergencyContactName) driverData.emergencyContactName = emergencyContactName;
      if (emergencyContactPhone) driverData.emergencyContactPhone = emergencyContactPhone;
      if (emergencyContactRelation) driverData.emergencyContactRelation = emergencyContactRelation;
      if (employeeCode) driverData.employeeCode = employeeCode;
      if (clientName) driverData.clientName = clientName;

      const driver = await Driver.create(driverData);
      await logEvent(driver._id, 'driver_created', {
        description: `Driver profile created via bulk import — ${driver.fullName || 'unnamed'}`,
      }, userId);

      // Evaluate auto-transition: draft → pending_kyc if all required fields present
      await evaluateAndTransition(driver._id, userId);

      results.created++;
    } catch (err) {
      results.errors.push({
        row: rowNum,
        fullName: str(row.fullName) || '(empty)',
        message: err.message || 'Unknown error',
      });
    }
  }

  return results;
};

module.exports = {
  findAll,
  findById,
  create,
  update,
  softDelete,
  getLedger,
  getExpiringDocuments,
  getStatusCounts,
  bulkCreate,
};
