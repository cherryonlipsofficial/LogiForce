const { getModel } = require('../../config/modelRegistry');
const { PAGINATION } = require('../../config/constants');
const { evaluateAndTransition } = require('./driverStatusEngine.service');
const { logEvent } = require('./driverHistory.service');

// Fields with a unique partial index — must never be persisted as null or an
// empty string. The partial filter excludes such rows from the uniqueness
// check, but storing them means a later `$set: { field: "real value" }` races
// against other null rows. Remove the key so Mongo stores the field as
// missing. Returns the list of fields that were cleared so an update can
// translate those into `$unset`.
const UNIQUE_STRING_FIELDS = ['phoneUae', 'emiratesId', 'passportNumber'];

const stripEmptyUniqueFields = (data) => {
  const cleared = [];
  for (const field of UNIQUE_STRING_FIELDS) {
    if (!(field in data)) continue;
    const value = data[field];
    const isEmpty =
      value === null ||
      value === undefined ||
      (typeof value === 'string' && value.trim() === '');
    if (isEmpty) {
      delete data[field];
      cleared.push(field);
    }
  }
  return cleared;
};

const findAll = async (req, filters = {}, pagination = {}) => {
  const Driver = getModel(req, 'Driver');
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
  if (filters.createdBy) {
    query.createdBy = filters.createdBy;
  }
  if (filters.clientIdStatus === 'missing') {
    if (!query.status) query.status = 'active';
    if (!query.$and) query.$and = [];
    query.$and.push({ $or: [{ clientUserId: { $exists: false } }, { clientUserId: null }, { clientUserId: '' }] });
  } else if (filters.clientIdStatus === 'assigned') {
    if (!query.$and) query.$and = [];
    query.$and.push({ clientUserId: { $exists: true } });
    query.$and.push({ clientUserId: { $ne: null } });
    query.$and.push({ clientUserId: { $ne: '' } });
  }
  if (filters.search) {
    const searchOr = [
      { fullName: { $regex: filters.search, $options: 'i' } },
      { employeeCode: { $regex: filters.search, $options: 'i' } },
      { emiratesId: { $regex: filters.search, $options: 'i' } },
      { passportNumber: { $regex: filters.search, $options: 'i' } },
    ];
    if (query.$and) {
      query.$and.push({ $or: searchOr });
    } else {
      query.$or = searchOr;
    }
  }

  const [drivers, total] = await Promise.all([
    Driver.find(query)
      .populate('clientId', 'name')
      .populate('supplierId', 'name')
      .populate({ path: 'projectId', select: 'name clientId', populate: { path: 'clientId', select: 'name' } })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Driver.countDocuments(query),
  ]);

  return { drivers, total, page, limit };
};

const findById = async (req, id) => {
  const Driver = getModel(req, 'Driver');

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

const create = async (req, data, userId) => {
  const Driver = getModel(req, 'Driver');

  stripEmptyUniqueFields(data);

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

  await logEvent(req, driver._id, 'driver_created', {
    description: `Driver profile created — ${driver.fullName || 'unnamed'}`,
  }, userId);

  // Evaluate auto-transition: draft → pending_kyc if all required fields present
  await evaluateAndTransition(req, driver._id, userId);

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

const update = async (req, id, data, userId, { isAdmin = false, canEditActive = false } = {}) => {
  const Driver = getModel(req, 'Driver');
  const Client = getModel(req, 'Client');
  const Supplier = getModel(req, 'Supplier');
  const Project = getModel(req, 'Project');
  const DriverDocument = getModel(req, 'DriverDocument');

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

  const clearedUniqueFields = stripEmptyUniqueFields(data);

  if (data.phoneUae) {
    const duplicate = await Driver.findOne({ phoneUae: data.phoneUae, _id: { $ne: id } });
    if (duplicate) {
      const err = new Error('A driver with this UAE phone number already exists');
      err.statusCode = 409;
      throw err;
    }
  }

  // Reference fields that need ObjectId comparison and name resolution
  const REFERENCE_FIELDS = {
    clientId: Client,
    supplierId: Supplier,
    projectId: Project,
  };

  // Detect changed fields before updating
  const changedFields = [];
  for (const field of TRACKED_FIELDS) {
    const isCleared = clearedUniqueFields.includes(field);
    if (data[field] === undefined && !isCleared) continue;
    const oldVal = existing[field];
    const newVal = isCleared ? undefined : data[field];

    if (REFERENCE_FIELDS[field]) {
      // Compare by ObjectId for reference fields to avoid false changes
      const oldId = oldVal ? String(oldVal._id || oldVal) : null;
      const newId = newVal ? String(newVal) : null;
      if (oldId === newId) continue;

      // Resolve the new name from the database
      const oldStr = formatFieldValue(oldVal);
      let newStr;
      if (newVal) {
        const refDoc = await REFERENCE_FIELDS[field].findById(newVal).select('name').lean();
        newStr = refDoc ? refDoc.name : String(newVal);
      } else {
        newStr = '(empty)';
      }
      changedFields.push({ field, oldValue: oldStr, newValue: newStr });
    } else {
      const oldStr = formatFieldValue(oldVal);
      const newStr = formatFieldValue(newVal);
      if (oldStr !== newStr) {
        changedFields.push({ field, oldValue: oldStr, newValue: newStr });
      }
    }
  }

  const updateQuery = { $set: data };
  if (clearedUniqueFields.length > 0) {
    updateQuery.$unset = Object.fromEntries(clearedUniqueFields.map((f) => [f, '']));
  }

  const driver = await Driver.findByIdAndUpdate(id, updateQuery, {
    new: true,
    runValidators: true,
  });

  // Log each field change to history
  for (const change of changedFields) {
    const label = FIELD_LABELS[change.field] || change.field;
    await logEvent(req, id, 'field_updated', {
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

  await evaluateAndTransition(req, id, userId);

  return driver;
};

const hardDelete = async (req, id) => {
  const Driver = getModel(req, 'Driver');
  const DriverLedger = getModel(req, 'DriverLedger');
  const DriverHistory = getModel(req, 'DriverHistory');
  const DriverDocument = getModel(req, 'DriverDocument');
  const VehicleAssignment = getModel(req, 'VehicleAssignment');
  const DriverProjectAssignment = getModel(req, 'DriverProjectAssignment');
  const Advance = getModel(req, 'Advance');
  const AttendanceRecord = getModel(req, 'AttendanceRecord');
  const SalaryRun = getModel(req, 'SalaryRun');

  const existing = await Driver.findById(id);
  if (!existing) {
    const err = new Error('Driver not found');
    err.statusCode = 404;
    throw err;
  }

  await Promise.all([
    DriverLedger.deleteMany({ driverId: id }),
    DriverHistory.deleteMany({ driverId: id }),
    DriverDocument.deleteMany({ driverId: id }),
    VehicleAssignment.deleteMany({ driverId: id }),
    DriverProjectAssignment.deleteMany({ driverId: id }),
    Advance.deleteMany({ driverId: id }),
    AttendanceRecord.deleteMany({ driverId: id }),
    SalaryRun.deleteMany({ driverId: id }),
  ]);

  await Driver.findByIdAndDelete(id);

  return { _id: id };
};

const getLedger = async (req, driverId, pagination = {}) => {
  const DriverLedger = getModel(req, 'DriverLedger');
  const page = parseInt(pagination.page) || PAGINATION.DEFAULT_PAGE;
  const limit = parseInt(pagination.limit) || PAGINATION.DEFAULT_LIMIT;
  const skip = (page - 1) * limit;

  const filter = { driverId, isDeleted: { $ne: true } };
  const [entries, total] = await Promise.all([
    DriverLedger.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('createdBy', 'name'),
    DriverLedger.countDocuments(filter),
  ]);

  return { entries, total, page, limit };
};

const getAllLedger = async (req, driverId) => {
  const DriverLedger = getModel(req, 'DriverLedger');

  return DriverLedger.find({ driverId, isDeleted: { $ne: true } })
    .sort({ createdAt: -1 })
    .populate('createdBy', 'name');
};

const getExpiringDocuments = async (req, days = 30) => {
  const DriverDocument = getModel(req, 'DriverDocument');
  const now = new Date();
  const threshold = new Date();
  threshold.setDate(threshold.getDate() + days);

  const docs = await DriverDocument.find({
    expiryDate: { $gte: now, $lte: threshold },
    status: { $ne: 'expired' },
  }).populate('driverId', 'fullName employeeCode clientId status');

  return docs;
};

const getStatusCounts = async (req) => {
  const Driver = getModel(req, 'Driver');

  const [total, active, onLeave, suspended, resigned, pendingClientId] = await Promise.all([
    Driver.countDocuments({}),
    Driver.countDocuments({ status: 'active' }),
    Driver.countDocuments({ status: 'on_leave' }),
    Driver.countDocuments({ status: 'suspended' }),
    Driver.countDocuments({ status: 'resigned' }),
    Driver.countDocuments({
      status: 'active',
      $or: [{ clientUserId: { $exists: false } }, { clientUserId: null }, { clientUserId: '' }],
    }),
  ]);
  return { total, active, onLeave, suspended, resigned, pendingClientId };
};

const bulkCreate = async (req, rows, userId) => {
  const Driver = getModel(req, 'Driver');
  const Project = getModel(req, 'Project');
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
      if (payStructure && !['MONTHLY_FIXED', 'DAILY_RATE', 'PER_ORDER'].includes(payStructure)) {
        throw new Error('Pay structure must be MONTHLY_FIXED, DAILY_RATE, or PER_ORDER');
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
      const passportExpiry = str(row.passportExpiry);
      const dateOfBirth = str(row.dateOfBirth);
      const email = str(row.email);
      const homeCountryPhone = expandNumber(row.homeCountryPhone);
      const emergencyContactName = str(row.emergencyContactName);
      const emergencyContactPhone = expandNumber(row.emergencyContactPhone);
      const emergencyContactRelation = str(row.emergencyContactRelation);
      const clientName = str(row.clientName);
      const clientUserId = str(row.clientUserId);

      if (passportNumber) driverData.passportNumber = passportNumber;
      if (visaNumber) driverData.visaNumber = visaNumber;
      if (passportExpiry) driverData.passportExpiry = new Date(passportExpiry);
      if (dateOfBirth) driverData.dateOfBirth = new Date(dateOfBirth);
      if (email) driverData.email = email;
      if (homeCountryPhone) driverData.homeCountryPhone = homeCountryPhone;
      if (emergencyContactName) driverData.emergencyContactName = emergencyContactName;
      if (emergencyContactPhone) driverData.emergencyContactPhone = emergencyContactPhone;
      if (emergencyContactRelation) driverData.emergencyContactRelation = emergencyContactRelation;
      if (clientName) driverData.clientName = clientName;
      if (clientUserId) driverData.clientUserId = clientUserId;

      // Passport submission fields
      const passportSubmissionType = str(row.passportSubmissionType).toLowerCase();
      if (passportSubmissionType === 'own') {
        driverData.isPassportSubmitted = true;
        driverData.passportSubmissionType = 'own';
      } else if (passportSubmissionType && passportSubmissionType !== '') {
        throw new Error('Passport submission type must be "own"');
      }

      const driver = await Driver.create(driverData);

      await logEvent(req, driver._id, 'driver_created', {
        description: `Driver profile created via bulk import — ${driver.fullName || 'unnamed'}`,
      }, userId);

      // Log passport submission event if applicable
      if (passportSubmissionType === 'own') {
        await logEvent(req, driver._id, 'field_updated', {
          description: 'Passport submission confirmed via bulk import (own passport)',
          fieldName: 'isPassportSubmitted',
        }, userId);
      }

      // Evaluate auto-transition: draft → pending_kyc if all required fields present
      await evaluateAndTransition(req, driver._id, userId);

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
  hardDelete,
  getLedger,
  getAllLedger,
  getExpiringDocuments,
  getStatusCounts,
  bulkCreate,
};
