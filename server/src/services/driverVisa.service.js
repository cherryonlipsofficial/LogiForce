const { getModel } = require('../config/modelRegistry');

/**
 * Round to 2 decimals.
 */
const round2 = (n) => Math.round((n || 0) * 100) / 100;

/**
 * Build the initial statement line items from the plan figures so the
 * statement renders something meaningful on the first view.
 */
const buildInitialLineItems = (payload, createdBy) => {
  const items = [];
  if ((payload.totalCost || 0) > 0) {
    items.push({
      direction: 'expense',
      label: 'Total Charges',
      amount: round2(payload.totalCost),
      date: new Date(),
      source: 'initial_charge',
      createdBy,
    });
  }
  if ((payload.medicalInsuranceCost || 0) > 0) {
    items.push({
      direction: 'expense',
      label: 'Medical Insurance',
      amount: round2(payload.medicalInsuranceCost),
      date: new Date(),
      source: 'medical_insurance',
      createdBy,
    });
  }
  if ((payload.cashPaid || 0) > 0) {
    items.push({
      direction: 'received',
      label: 'Cash Payment',
      amount: round2(payload.cashPaid),
      date: new Date(),
      source: 'manual_cash',
      createdBy,
    });
  }
  return items;
};

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
    visaLabel: payload.visaLabel,
    referenceName: payload.referenceName,
    visaNumber: payload.visaNumber,
    issueDate: payload.issueDate,
    expiryDate: payload.expiryDate,
    totalCost: round2(payload.totalCost || 0),
    medicalInsuranceCost: round2(payload.medicalInsuranceCost || 0),
    discountAmount: round2(payload.discountAmount || 0),
    cashPaid: round2(payload.cashPaid || 0),
    monthlyDeduction: round2(payload.monthlyDeduction || 0),
    totalRecovered: 0,
    remarks: payload.remarks,
    status: 'active',
    lineItems: buildInitialLineItems(payload, createdBy),
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

  const allowed = [
    'visaCategory',
    'visaLabel',
    'referenceName',
    'visaNumber',
    'issueDate',
    'expiryDate',
    'remarks',
  ];
  for (const key of allowed) {
    if (payload[key] !== undefined) visa[key] = payload[key];
  }
  visa.lastUpdatedBy = userId;
  await visa.save();
  return visa;
};

/**
 * Log the visa processing date (Operations only, driver_visas.log_processing).
 */
const logVisaProcessing = async (req, visaId, processedDate, userId) => {
  const DriverVisa = getModel(req, 'DriverVisa');
  const visa = await DriverVisa.findById(visaId);
  if (!visa) {
    const err = new Error('Visa record not found');
    err.statusCode = 404;
    throw err;
  }
  visa.visaProcessedDate = processedDate ? new Date(processedDate) : new Date();
  visa.visaProcessedBy = userId;
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

  const editable = [
    'totalCost',
    'medicalInsuranceCost',
    'discountAmount',
    'cashPaid',
    'monthlyDeduction',
  ];
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

  if (newRecoverable === 0) visa.status = 'waived';
  else if (visa.totalRecovered >= newRecoverable) visa.status = 'fully_recovered';

  await visa.save();
  return visa;
};

/**
 * Add a statement line item (expense or received).
 * Admin/Finance/Accounts only (driver_visas.manage).
 */
const addLineItem = async (req, visaId, payload, userId) => {
  const DriverVisa = getModel(req, 'DriverVisa');
  const visa = await DriverVisa.findById(visaId);
  if (!visa) {
    const err = new Error('Visa record not found');
    err.statusCode = 404;
    throw err;
  }

  const amount = round2(payload.amount);
  if (!amount || amount <= 0) {
    const err = new Error('Amount must be greater than zero');
    err.statusCode = 400;
    throw err;
  }
  if (!['expense', 'received'].includes(payload.direction)) {
    const err = new Error('direction must be "expense" or "received"');
    err.statusCode = 400;
    throw err;
  }

  visa.lineItems.push({
    direction: payload.direction,
    label: String(payload.label || '').trim() || (payload.direction === 'expense' ? 'Expense' : 'Received'),
    amount,
    date: payload.date ? new Date(payload.date) : new Date(),
    source: payload.direction === 'received' ? 'manual_cash' : 'manual_charge',
    notes: payload.notes,
    createdBy: userId,
  });

  // Keep the summary financials loosely in sync for the recovery logic:
  // - Manual cash received against visa → increments cashPaid (non-recoverable)
  // - Manual expense → increments totalCost (more to recover)
  if (payload.direction === 'received' && payload.affectsCashPaid !== false) {
    visa.cashPaid = round2((visa.cashPaid || 0) + amount);
  }
  if (payload.direction === 'expense' && payload.affectsTotalCost !== false) {
    visa.totalCost = round2((visa.totalCost || 0) + amount);
  }

  visa.lastUpdatedBy = userId;
  await visa.save();
  return visa;
};

/**
 * Remove a line item (Admin/Finance/Accounts). Reverses the corresponding
 * summary adjustment if the item was recorded as manual_cash/manual_charge.
 */
const removeLineItem = async (req, visaId, lineItemId, userId) => {
  const DriverVisa = getModel(req, 'DriverVisa');
  const visa = await DriverVisa.findById(visaId);
  if (!visa) {
    const err = new Error('Visa record not found');
    err.statusCode = 404;
    throw err;
  }

  const item = visa.lineItems.id(lineItemId);
  if (!item) {
    const err = new Error('Line item not found');
    err.statusCode = 404;
    throw err;
  }
  // Refuse to delete salary-posted items — they are reversed by deleting the
  // salary run instead.
  if (item.source === 'salary_deduction') {
    const err = new Error('Salary deduction line items cannot be deleted directly');
    err.statusCode = 400;
    throw err;
  }

  if (item.source === 'manual_cash') {
    visa.cashPaid = Math.max(0, round2((visa.cashPaid || 0) - item.amount));
  } else if (item.source === 'manual_charge') {
    visa.totalCost = Math.max(0, round2((visa.totalCost || 0) - item.amount));
  }

  item.deleteOne();
  visa.lastUpdatedBy = userId;
  await visa.save();
  return visa;
};

/**
 * Waive the remaining balance (Admin/Finance/Accounts).
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
 * Cancel a visa record (Admin/Finance/Accounts).
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
 * List visa records (optionally filtered by driver / status / expiring soon).
 */
const listVisaRecords = async (
  req,
  { driverId, status, expiringInDays, unprocessed, page = 1, limit = 20 } = {}
) => {
  const DriverVisa = getModel(req, 'DriverVisa');
  const query = {};
  if (driverId) query.driverId = driverId;
  if (status) query.status = status;
  if (expiringInDays) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + parseInt(expiringInDays));
    query.expiryDate = { $lte: cutoff, $gte: new Date() };
  }
  if (unprocessed === true || unprocessed === 'true') {
    query.visaProcessedDate = { $in: [null] };
  }

  const [items, total] = await Promise.all([
    DriverVisa.find(query)
      .populate('driverId', 'fullName employeeCode visaType phoneUae')
      .populate('createdBy', 'name')
      .populate('lastUpdatedBy', 'name')
      .populate('visaProcessedBy', 'name')
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
 * Mark recovery on a visa after a salary run is processed and append a
 * line item to the statement so the deduction shows up alongside manual
 * cash payments.
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

    // Guard against double-posting (e.g. re-processing)
    const alreadyPosted = (visa.lineItems || []).some(
      (l) =>
        l.source === 'salary_deduction' &&
        l.salaryRunId &&
        String(l.salaryRunId) === String(salaryRun._id)
    );
    if (alreadyPosted) continue;

    visa.totalRecovered = round2((visa.totalRecovered || 0) + d.amount);

    const period = salaryRun.period || {};
    visa.lineItems.push({
      direction: 'received',
      label: `Salary Deduction ${period.year || ''}-${String(period.month || '').padStart(2, '0')}`.trim(),
      amount: round2(d.amount),
      date: salaryRun.processedAt || new Date(),
      source: 'salary_deduction',
      salaryRunId: salaryRun._id,
      notes: salaryRun.runId,
    });

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
  logVisaProcessing,
  addLineItem,
  removeLineItem,
  waiveVisa,
  cancelVisa,
  listVisaRecords,
  resolveVisaDeductionForDriver,
  recordVisaRecovery,
  computeOutstanding,
};
