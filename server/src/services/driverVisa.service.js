const { getModel } = require('../config/modelRegistry');

/**
 * Round to 2 decimals.
 */
const round2 = (n) => Math.round((n || 0) * 100) / 100;

/**
 * Compute the outstanding amount (recoverable minus already recovered).
 */
const computeOutstanding = (visa) => {
  const recoverable = round2(
    (visa.totalCost || 0) - (visa.discountAmount || 0) - (visa.cashPaid || 0)
  );
  return Math.max(0, round2(recoverable - (visa.totalRecovered || 0)));
};

/**
 * Create a new driver visa record.
 * Usable by Sales / Compliance (driver_visas.create).
 * Financial fields are accepted but can only be modified later by those with
 * driver_visas.manage.
 */
const createVisaRecord = async (req, driverId, payload, createdBy) => {
  const DriverVisa = getModel(req, 'DriverVisa');
  const Driver = getModel(req, 'Driver');

  const driver = await Driver.findById(driverId);
  if (!driver) {
    const err = new Error('Driver not found');
    err.statusCode = 404;
    throw err;
  }

  // Enforce one active visa per driver
  const existing = await DriverVisa.findOne({ driverId, status: 'active' });
  if (existing) {
    const err = new Error(
      'Driver already has an active visa record. Close or cancel it before creating a new one.'
    );
    err.statusCode = 409;
    throw err;
  }

  const record = await DriverVisa.create({
    driverId,
    visaCategory: payload.visaCategory,
    visaNumber: payload.visaNumber,
    issueDate: payload.issueDate,
    expiryDate: payload.expiryDate,
    totalCost: round2(payload.totalCost || 0),
    discountAmount: round2(payload.discountAmount || 0),
    cashPaid: round2(payload.cashPaid || 0),
    monthlyDeduction: round2(payload.monthlyDeduction || 0),
    totalRecovered: 0,
    remarks: payload.remarks,
    status: 'active',
    createdBy,
    lastUpdatedBy: createdBy,
  });

  return record;
};

/**
 * Update non-financial fields (driver_visas.edit) — Sales/Compliance allowed.
 */
const updateVisaBasics = async (req, visaId, payload, userId) => {
  const DriverVisa = getModel(req, 'DriverVisa');
  const visa = await DriverVisa.findById(visaId);
  if (!visa) {
    const err = new Error('Visa record not found');
    err.statusCode = 404;
    throw err;
  }

  const allowed = ['visaCategory', 'visaNumber', 'issueDate', 'expiryDate', 'remarks'];
  for (const key of allowed) {
    if (payload[key] !== undefined) visa[key] = payload[key];
  }
  visa.lastUpdatedBy = userId;
  await visa.save();
  return visa;
};

/**
 * Update financial fields & the agreed monthly deduction.
 * Restricted to Admin / Finance / Accounts (driver_visas.manage).
 */
const updateVisaFinancials = async (req, visaId, payload, userId) => {
  const DriverVisa = getModel(req, 'DriverVisa');
  const visa = await DriverVisa.findById(visaId);
  if (!visa) {
    const err = new Error('Visa record not found');
    err.statusCode = 404;
    throw err;
  }

  if (visa.status !== 'active') {
    const err = new Error(`Cannot edit financials on a ${visa.status} visa record`);
    err.statusCode = 400;
    throw err;
  }

  const editable = ['totalCost', 'discountAmount', 'cashPaid', 'monthlyDeduction'];
  for (const key of editable) {
    if (payload[key] !== undefined) visa[key] = round2(payload[key]);
  }
  if (payload.remarks !== undefined) visa.remarks = payload.remarks;
  visa.lastUpdatedBy = userId;

  // Sanity: cannot recover more than recoverable
  const newRecoverable = round2(
    (visa.totalCost || 0) - (visa.discountAmount || 0) - (visa.cashPaid || 0)
  );
  if (visa.totalRecovered > newRecoverable) {
    const err = new Error(
      `New financials would put totalRecovered (${visa.totalRecovered}) above recoverableAmount (${newRecoverable}). Adjust totalRecovered first or raise totalCost.`
    );
    err.statusCode = 400;
    throw err;
  }

  // Auto-close if the new plan has nothing left to recover
  if (newRecoverable === 0 || visa.totalRecovered >= newRecoverable) {
    visa.status = newRecoverable === 0 ? 'waived' : 'fully_recovered';
  }

  await visa.save();
  return visa;
};

/**
 * Waive the remaining balance (Admin/Finance/Accounts).
 * Marks the record as 'waived' and stops further deductions.
 */
const waiveVisa = async (req, visaId, reason, userId) => {
  const DriverVisa = getModel(req, 'DriverVisa');
  const visa = await DriverVisa.findById(visaId);
  if (!visa) {
    const err = new Error('Visa record not found');
    err.statusCode = 404;
    throw err;
  }
  if (visa.status !== 'active') {
    const err = new Error(`Cannot waive a ${visa.status} visa record`);
    err.statusCode = 400;
    throw err;
  }
  visa.status = 'waived';
  visa.remarks = visa.remarks
    ? `${visa.remarks}\nWaived: ${reason || 'no reason given'}`
    : `Waived: ${reason || 'no reason given'}`;
  visa.lastUpdatedBy = userId;
  await visa.save();
  return visa;
};

/**
 * Cancel a visa record (Admin/Finance/Accounts). Does not refund anything
 * already recovered — use manual salary adjustment for that.
 */
const cancelVisa = async (req, visaId, reason, userId) => {
  const DriverVisa = getModel(req, 'DriverVisa');
  const visa = await DriverVisa.findById(visaId);
  if (!visa) {
    const err = new Error('Visa record not found');
    err.statusCode = 404;
    throw err;
  }
  visa.status = 'cancelled';
  visa.remarks = visa.remarks
    ? `${visa.remarks}\nCancelled: ${reason || 'no reason given'}`
    : `Cancelled: ${reason || 'no reason given'}`;
  visa.lastUpdatedBy = userId;
  await visa.save();
  return visa;
};

/**
 * List visa records (optionally filtered by driver / status).
 */
const listVisaRecords = async (req, { driverId, status, page = 1, limit = 20 } = {}) => {
  const DriverVisa = getModel(req, 'DriverVisa');
  const query = {};
  if (driverId) query.driverId = driverId;
  if (status) query.status = status;

  const [items, total] = await Promise.all([
    DriverVisa.find(query)
      .populate('driverId', 'fullName employeeCode visaType')
      .populate('createdBy', 'name')
      .populate('lastUpdatedBy', 'name')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean({ virtuals: true }),
    DriverVisa.countDocuments(query),
  ]);

  return { items, total };
};

/**
 * Resolve the auto-deduction amount for a given driver in a given period.
 *
 * Returns the deduction payload (or null if no deduction applies).
 * - Uses the visa's agreed monthlyDeduction
 * - Caps at remaining outstandingAmount
 * - Skips if status is not 'active' or monthlyDeduction <= 0
 *
 * The actual salary-less-than-deduction case (excuse this month) is handled
 * downstream by the salary carryover mechanism + manual adjustment.
 */
const resolveVisaDeductionForDriver = async (req, driverId) => {
  const DriverVisa = getModel(req, 'DriverVisa');
  const visa = await DriverVisa.findOne({ driverId, status: 'active' });
  if (!visa) return null;
  if (!visa.monthlyDeduction || visa.monthlyDeduction <= 0) return null;

  const outstanding = computeOutstanding(visa);
  if (outstanding <= 0) return null;

  const amount = round2(Math.min(visa.monthlyDeduction, outstanding));
  return {
    visa,
    deduction: {
      type: 'visa_cost',
      referenceId: String(visa._id),
      amount,
      description: `Visa cost recovery (${visa.visaCategory === 'twp' ? 'TWP' : 'Company Visa'})${visa.visaNumber ? ' - ' + visa.visaNumber : ''}`,
      status: 'applied',
    },
  };
};

/**
 * Mark recovery on a visa after a salary run is processed.
 * Called from salary.service.postLedgerEntries / processSalaryRun so that
 * partial-excuse adjustments (where Finance removed the visa deduction from
 * the salary run) don't get recorded.
 */
const recordVisaRecovery = async (req, driverId, salaryRun) => {
  const DriverVisa = getModel(req, 'DriverVisa');

  const visaDeductions = (salaryRun.deductions || []).filter(
    (d) => d.type === 'visa_cost' && d.referenceId && d.amount > 0
  );
  if (visaDeductions.length === 0) return;

  for (const d of visaDeductions) {
    const visa = await DriverVisa.findById(d.referenceId);
    if (!visa || String(visa.driverId) !== String(driverId)) continue;

    visa.totalRecovered = round2((visa.totalRecovered || 0) + d.amount);

    const recoverable = round2(
      (visa.totalCost || 0) - (visa.discountAmount || 0) - (visa.cashPaid || 0)
    );
    if (visa.totalRecovered >= recoverable) {
      visa.totalRecovered = recoverable;
      visa.status = 'fully_recovered';
    }
    await visa.save();
  }
};

module.exports = {
  createVisaRecord,
  updateVisaBasics,
  updateVisaFinancials,
  waiveVisa,
  cancelVisa,
  listVisaRecords,
  resolveVisaDeductionForDriver,
  recordVisaRecovery,
  computeOutstanding,
};
