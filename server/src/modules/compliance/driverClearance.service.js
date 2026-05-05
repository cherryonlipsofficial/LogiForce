const { getModel } = require('../../config/modelRegistry');

/**
 * Create (or return existing) open DriverClearance for a driver being offboarded/resigned.
 * Intended to be called from driverWorkflow.service when status transitions to
 * 'resigned' or 'offboarded'.
 */
async function openClearanceForOffboarding(req, driverId, newStatus, userId, opts = {}) {
  const DriverClearance = getModel(req, 'DriverClearance');
  const Driver = getModel(req, 'Driver');

  const existing = await DriverClearance.findOne({ driverId, isDeleted: false });
  if (existing) return existing;

  const driver = await Driver.findById(driverId).lean();
  if (!driver) {
    const err = new Error('Driver not found');
    err.statusCode = 404;
    throw err;
  }

  const usesCompanyVehicle = !driver.ownVehicle && Boolean(driver.supplierId || driver.currentVehicleId);

  const lastWorkingDate = opts.lastWorkingDate
    ? new Date(opts.lastWorkingDate)
    : (driver.lastWorkingDay ? new Date(driver.lastWorkingDay) : new Date());

  const clearance = new DriverClearance({
    driverId,
    driverName: driver.fullName,
    employeeCode: driver.employeeCode,
    projectId: driver.projectId || undefined,
    clientId: driver.clientId || undefined,
    supplierId: driver.supplierId || undefined,
    lastWorkingDate,
    triggerStatus: newStatus,
    usesCompanyVehicle,
    clientClearance: { status: 'pending' },
    supplierClearance: usesCompanyVehicle
      ? { status: 'pending' }
      : { status: 'not_applicable', remarks: 'Driver owns vehicle — supplier clearance not required' },
    internalClearance: { status: 'pending' },
    createdBy: userId,
  });

  await clearance.save();
  return clearance;
}

/**
 * Correct the lastWorkingDate on an existing clearance and mirror it back to
 * the Driver record. Used when the driver was already moved to resigned/
 * offboarded with the wrong (auto-set) date.
 */
async function updateLastWorkingDate(req, clearanceId, lastWorkingDate, userId) {
  const DriverClearance = getModel(req, 'DriverClearance');
  const Driver = getModel(req, 'Driver');

  if (!lastWorkingDate) {
    const err = new Error('lastWorkingDate is required');
    err.statusCode = 400;
    throw err;
  }
  const parsed = new Date(lastWorkingDate);
  if (Number.isNaN(parsed.getTime())) {
    const err = new Error('lastWorkingDate must be a valid date');
    err.statusCode = 400;
    throw err;
  }
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  if (parsed > today) {
    const err = new Error('Last working date cannot be in the future');
    err.statusCode = 400;
    throw err;
  }

  const doc = await DriverClearance.findOne({ _id: clearanceId, isDeleted: false });
  if (!doc) {
    const err = new Error('Clearance record not found');
    err.statusCode = 404;
    throw err;
  }

  const driver = await Driver.findById(doc.driverId);
  if (driver?.joinDate && parsed < new Date(driver.joinDate)) {
    const err = new Error('Last working date cannot be before the driver join date');
    err.statusCode = 400;
    throw err;
  }

  doc.lastWorkingDate = parsed;
  await doc.save();

  if (driver) {
    driver.lastWorkingDay = parsed;
    await driver.save();
  }

  return doc;
}

async function listClearances(req, filters = {}, { page = 1, limit = 20 } = {}) {
  const DriverClearance = getModel(req, 'DriverClearance');
  const query = { isDeleted: false };
  if (filters.overallStatus) query.overallStatus = filters.overallStatus;
  if (filters.driverId) query.driverId = filters.driverId;
  if (filters.clientId) query.clientId = filters.clientId;
  if (filters.projectId) query.projectId = filters.projectId;

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    DriverClearance.find(query)
      .populate('driverId', 'fullName employeeCode status')
      .populate('clientId', 'name')
      .populate('projectId', 'name')
      .populate('supplierId', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    DriverClearance.countDocuments(query),
  ]);
  return { items, total, page, limit };
}

async function getClearance(req, id) {
  const DriverClearance = getModel(req, 'DriverClearance');
  const doc = await DriverClearance.findOne({ _id: id, isDeleted: false })
    .populate('driverId', 'fullName employeeCode status ownVehicle')
    .populate('clientId', 'name')
    .populate('projectId', 'name')
    .populate('supplierId', 'name')
    .populate('clientClearance.loggedBy', 'name email')
    .populate('supplierClearance.loggedBy', 'name email')
    .populate('internalClearance.loggedBy', 'name email');
  if (!doc) {
    const err = new Error('Clearance record not found');
    err.statusCode = 404;
    throw err;
  }
  return doc;
}

const VALID_STATUSES = ['pending', 'received', 'waived'];

function validatePayload(body) {
  const { status } = body;
  if (!VALID_STATUSES.includes(status)) {
    const err = new Error(`Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`);
    err.statusCode = 400;
    throw err;
  }
  if (status !== 'pending') {
    if (!body.receivedDate) {
      const err = new Error('receivedDate is required when marking clearance as received or waived');
      err.statusCode = 400;
      throw err;
    }
  }
}

async function updateSection(req, id, section, body, userId) {
  const DriverClearance = getModel(req, 'DriverClearance');
  const doc = await DriverClearance.findOne({ _id: id, isDeleted: false });
  if (!doc) {
    const err = new Error('Clearance record not found');
    err.statusCode = 404;
    throw err;
  }

  validatePayload(body);

  if (section === 'supplierClearance' && !doc.usesCompanyVehicle) {
    const err = new Error('Supplier clearance not applicable — driver did not use a company/supplier vehicle');
    err.statusCode = 400;
    throw err;
  }

  doc[section] = {
    status: body.status,
    receivedDate: body.receivedDate ? new Date(body.receivedDate) : undefined,
    emailRef: body.emailRef,
    attachmentUrl: body.attachmentUrl,
    remarks: body.remarks,
    loggedBy: userId,
    loggedAt: new Date(),
  };

  await doc.save();
  return doc;
}

async function addSupplierDeduction(req, id, body, userId) {
  const DriverClearance = getModel(req, 'DriverClearance');
  const doc = await DriverClearance.findOne({ _id: id, isDeleted: false });
  if (!doc) {
    const err = new Error('Clearance record not found');
    err.statusCode = 404;
    throw err;
  }
  if (!doc.usesCompanyVehicle) {
    const err = new Error('Cannot add supplier deduction — driver did not use a company vehicle');
    err.statusCode = 400;
    throw err;
  }

  const amount = parseFloat(body.amount);
  if (!body.type || !Number.isFinite(amount) || amount <= 0) {
    const err = new Error('type and positive amount are required');
    err.statusCode = 400;
    throw err;
  }

  doc.supplierDeductions.push({
    type: body.type,
    amount,
    description: body.description,
    addedBy: userId,
  });
  await doc.save();
  return doc;
}

async function removeSupplierDeduction(req, id, deductionId) {
  const DriverClearance = getModel(req, 'DriverClearance');
  const doc = await DriverClearance.findOne({ _id: id, isDeleted: false });
  if (!doc) {
    const err = new Error('Clearance record not found');
    err.statusCode = 404;
    throw err;
  }
  const entry = doc.supplierDeductions.id(deductionId);
  if (!entry) {
    const err = new Error('Deduction entry not found');
    err.statusCode = 404;
    throw err;
  }
  if (entry.postedToSalaryRunId) {
    const err = new Error('Cannot remove a deduction that has already been posted to a salary run');
    err.statusCode = 400;
    throw err;
  }
  entry.deleteOne();
  await doc.save();
  return doc;
}

/**
 * Return the current open clearance for a driver, or null.
 */
async function findOpenClearanceForDriver(req, driverId) {
  const DriverClearance = getModel(req, 'DriverClearance');
  return DriverClearance.findOne({ driverId, isDeleted: false });
}

module.exports = {
  openClearanceForOffboarding,
  updateLastWorkingDate,
  listClearances,
  getClearance,
  updateSection,
  addSupplierDeduction,
  removeSupplierDeduction,
  findOpenClearanceForDriver,
};
