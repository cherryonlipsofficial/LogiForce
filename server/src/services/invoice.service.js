const { Invoice, SalaryRun, Client, Driver, DriverLedger, Project, AttendanceBatch, AttendanceRecord, DriverProjectAssignment } = require('../models');

const STANDARD_DAYS = 26;
const VAT_RATE = 0.05;

const generateInvoice = async (clientId, year, month, createdBy, { projectId, attendanceBatchIds } = {}) => {
  // Fetch client for fallback rate and payment terms
  const client = await Client.findById(clientId);
  if (!client) {
    const err = new Error('Client not found');
    err.statusCode = 404;
    throw err;
  }

  const fallbackRate = client.ratePerDriver || 0;

  // If attendanceBatchIds are provided, generate from attendance batches
  if (attendanceBatchIds && attendanceBatchIds.length > 0) {
    return generateFromAttendanceBatches(client, year, month, createdBy, projectId, attendanceBatchIds);
  }

  // Legacy flow: generate from salary runs
  // 1. Check no invoice already exists for this client/period/project
  const existingQuery = {
    clientId,
    'period.year': year,
    'period.month': month,
  };
  if (projectId) {
    existingQuery['projectGroups.projectId'] = projectId;
  }
  const existing = await Invoice.findOne(existingQuery);
  if (existing) {
    const err = new Error(`Invoice already exists for this client/period: ${existing.invoiceNo}`);
    err.statusCode = 409;
    throw err;
  }

  // 2. Fetch all approved salary runs for this client/period
  const salaryQuery = {
    clientId,
    'period.year': year,
    'period.month': month,
    status: 'approved',
  };
  if (projectId) {
    salaryQuery.projectId = projectId;
  }

  const salaryRuns = await SalaryRun.find(salaryQuery).populate('driverId', 'employeeCode fullName');

  if (salaryRuns.length === 0) {
    const err = new Error('No approved salary runs found for this client/period');
    err.statusCode = 400;
    throw err;
  }

  // 3. Group salary runs by projectId
  const grouped = {};
  const unassignedRuns = [];

  for (const run of salaryRuns) {
    if (run.projectId) {
      const key = run.projectId.toString();
      if (!grouped[key]) grouped[key] = { runs: [] };
      grouped[key].runs.push(run);
    } else {
      unassignedRuns.push(run);
    }
  }

  // Fetch project details for grouped runs
  const projectIds = Object.keys(grouped);
  if (projectIds.length > 0) {
    const projects = await Project.find({ _id: { $in: projectIds } })
      .select('name projectCode ratePerDriver rateBasis')
      .lean();
    for (const p of projects) {
      const key = p._id.toString();
      if (grouped[key]) grouped[key].projectDoc = p;
    }
  }

  // 4. Build projectGroups array
  const projectGroups = [];

  for (const [key, group] of Object.entries(grouped)) {
    const proj = group.projectDoc || {};
    const runs = group.runs;

    const rateBasis = proj.rateBasis || 'monthly_fixed';
    const drivers = runs.map((run) => {
      const rate = run.projectRatePerDriver || proj.ratePerDriver || fallbackRate;
      let ratePerDay;
      if (rateBasis === 'daily_rate') {
        ratePerDay = rate;
      } else {
        ratePerDay = rate / STANDARD_DAYS;
      }
      return {
        driverId: run.driverId._id,
        employeeCode: run.driverId.employeeCode,
        driverName: run.driverId.fullName,
        workingDays: run.workingDays,
        ratePerDay: Math.round(ratePerDay * 100) / 100,
        amount: Math.round(run.workingDays * ratePerDay * 100) / 100,
      };
    });

    const subtotal = drivers.reduce((sum, d) => sum + d.amount, 0);

    projectGroups.push({
      projectId: proj._id || key,
      projectName: proj.name || 'Unknown project',
      projectCode: proj.projectCode || '',
      ratePerDriver: proj.ratePerDriver || fallbackRate,
      drivers,
      driverCount: drivers.length,
      subtotal: Math.round(subtotal * 100) / 100,
    });
  }

  if (unassignedRuns.length > 0) {
    const drivers = unassignedRuns.map((run) => {
      const ratePerDay = fallbackRate / STANDARD_DAYS;
      return {
        driverId: run.driverId._id,
        employeeCode: run.driverId.employeeCode,
        driverName: run.driverId.fullName,
        workingDays: run.workingDays,
        ratePerDay: Math.round(ratePerDay * 100) / 100,
        amount: Math.round(run.workingDays * ratePerDay * 100) / 100,
      };
    });

    const subtotal = drivers.reduce((sum, d) => sum + d.amount, 0);

    projectGroups.push({
      projectId: null,
      projectName: 'Unassigned',
      projectCode: '',
      ratePerDriver: fallbackRate,
      drivers,
      driverCount: drivers.length,
      subtotal: Math.round(subtotal * 100) / 100,
    });
  }

  const lineItems = projectGroups.flatMap((g) => g.drivers).map((d) => {
    const vatAmt = parseFloat((d.amount * VAT_RATE).toFixed(2));
    return { ...d, vatRate: VAT_RATE, vatAmount: vatAmt, totalWithVat: parseFloat((d.amount + vatAmt).toFixed(2)) };
  });

  const subtotal = projectGroups.reduce((sum, g) => sum + g.subtotal, 0);
  const vatAmount = Math.round(subtotal * VAT_RATE * 100) / 100;
  const total = Math.round((subtotal + vatAmount) * 100) / 100;

  const servicePeriodFrom = new Date(year, month - 1, 1);
  const servicePeriodTo = new Date(year, month, 0);

  const issuedDate = new Date();
  const paymentDays = parseInt(client.paymentTerms?.replace(/\D/g, '')) || 30;
  const dueDate = new Date(issuedDate);
  dueDate.setDate(dueDate.getDate() + paymentDays);

  const invoice = await Invoice.create({
    clientId,
    period: { year, month },
    servicePeriodFrom,
    servicePeriodTo,
    lineItems,
    projectGroups,
    driverCount: lineItems.length,
    subtotal,
    vatRate: VAT_RATE,
    vatAmount,
    total,
    status: 'draft',
    issuedDate,
    dueDate,
    createdBy,
  });

  return invoice;
};

/**
 * Generate invoice from selected attendance batches.
 */
const generateFromAttendanceBatches = async (client, year, month, createdBy, projectId, attendanceBatchIds) => {
  // Validate all batches exist and are fully_approved
  const batches = await AttendanceBatch.find({
    _id: { $in: attendanceBatchIds },
    clientId: client._id,
    status: 'fully_approved',
    invoiceId: null,
  });

  if (batches.length !== attendanceBatchIds.length) {
    const err = new Error('Some attendance batches are invalid, already invoiced, or not fully approved');
    err.statusCode = 400;
    throw err;
  }

  // Fetch attendance records from selected batches
  const recordQuery = { batchId: { $in: attendanceBatchIds } };
  if (projectId) {
    recordQuery.projectId = projectId;
  }

  const records = await AttendanceRecord.find(recordQuery)
    .populate({
      path: 'driverId',
      select: 'fullName employeeCode',
    })
    .populate({
      path: 'projectId',
      select: 'name projectCode ratePerDriver rateBasis',
    })
    .lean();

  if (!records.length) {
    const err = new Error('No attendance records found for the selected batches');
    err.statusCode = 400;
    throw err;
  }

  // Group records by project
  const projectMap = {};

  for (const record of records) {
    const driver = record.driverId;
    const project = record.projectId;

    if (!project) continue;

    const projKey = project._id.toString();
    if (!projectMap[projKey]) {
      projectMap[projKey] = {
        projectId: project._id,
        projectName: project.name,
        projectCode: project.projectCode,
        ratePerDriver: project.ratePerDriver || 0,
        dailyRate: 0,
        drivers: [],
        driverCount: 0,
        subtotal: 0,
      };
    }

    let ratePerDriver = project.ratePerDriver || client.ratePerDriver || 0;

    const activeAssignment = await DriverProjectAssignment.findOne({
      driverId: driver._id,
      projectId: project._id,
      status: 'active',
    }).select('ratePerDriver');

    if (activeAssignment?.ratePerDriver) {
      ratePerDriver = activeAssignment.ratePerDriver;
    }

    const rateBasis = project.rateBasis || 'monthly_fixed';
    let dailyRate;
    let amount;

    if (rateBasis === 'daily_rate') {
      // Daily rate: ratePerDriver IS the daily rate, multiply directly by working days
      dailyRate = ratePerDriver;
      amount = parseFloat((ratePerDriver * record.workingDays).toFixed(2));
    } else {
      // Monthly fixed (default): divide monthly rate by standard days
      dailyRate = ratePerDriver / STANDARD_DAYS;
      amount = parseFloat((dailyRate * record.workingDays).toFixed(2));
    }

    projectMap[projKey].ratePerDriver = ratePerDriver;
    projectMap[projKey].dailyRate = parseFloat(dailyRate.toFixed(4));
    projectMap[projKey].rateBasis = rateBasis;
    projectMap[projKey].drivers.push({
      driverId: driver._id,
      driverName: driver.fullName,
      employeeCode: driver.employeeCode,
      workingDays: record.workingDays,
      overtimeHours: record.overtimeHours || 0,
      ratePerDay: parseFloat(dailyRate.toFixed(2)),
      amount,
    });
    projectMap[projKey].subtotal += amount;
  }

  const projectGroups = Object.values(projectMap).map((pg) => ({
    ...pg,
    driverCount: pg.drivers.length,
    subtotal: parseFloat(pg.subtotal.toFixed(2)),
  }));

  if (!projectGroups.length) {
    const err = new Error('No valid project data found. Ensure drivers are assigned to projects.');
    err.statusCode = 400;
    throw err;
  }

  const lineItems = projectGroups.flatMap((g) => g.drivers).map((d) => {
    const vatAmt = parseFloat((d.amount * VAT_RATE).toFixed(2));
    return { ...d, vatRate: VAT_RATE, vatAmount: vatAmt, totalWithVat: parseFloat((d.amount + vatAmt).toFixed(2)) };
  });
  const subtotal = parseFloat(projectGroups.reduce((sum, pg) => sum + pg.subtotal, 0).toFixed(2));
  const vatAmount = parseFloat((subtotal * VAT_RATE).toFixed(2));
  const total = parseFloat((subtotal + vatAmount).toFixed(2));

  const servicePeriodFrom = new Date(year, month - 1, 1);
  const servicePeriodTo = new Date(year, month, 0);

  const issuedDate = new Date();
  const paymentDays = parseInt(client.paymentTerms?.replace(/\D/g, '')) || 30;
  const dueDate = new Date(issuedDate);
  dueDate.setDate(dueDate.getDate() + paymentDays);

  const invoice = await Invoice.create({
    clientId: client._id,
    projectId,
    attendanceBatchId: attendanceBatchIds[0],
    period: { year, month },
    servicePeriodFrom,
    servicePeriodTo,
    lineItems,
    projectGroups,
    driverCount: lineItems.length,
    subtotal,
    vatRate: VAT_RATE,
    vatAmount,
    total,
    status: 'draft',
    issuedDate,
    dueDate,
    createdBy,
  });

  // Mark all selected batches as invoiced
  await AttendanceBatch.updateMany(
    { _id: { $in: attendanceBatchIds } },
    {
      $set: {
        status: 'invoiced',
        invoiceId: invoice._id,
        invoicedAt: new Date(),
        invoicedBy: createdBy,
      },
    }
  );

  return invoice;
};

const addCreditNote = async (invoiceId, { driverId, amount, reason }, createdBy) => {
  // 1. Fetch invoice, verify status
  const invoice = await Invoice.findById(invoiceId);
  if (!invoice) {
    const err = new Error('Invoice not found');
    err.statusCode = 404;
    throw err;
  }
  if (invoice.status === 'cancelled') {
    const err = new Error('Cannot add credit note to a cancelled invoice');
    err.statusCode = 400;
    throw err;
  }

  // 2. Push credit note
  invoice.creditNotes.push({
    driverId,
    amount,
    reason,
    createdAt: new Date(),
  });

  // 3. Subtract credit note amount from invoice total
  invoice.total = Math.round((invoice.total - amount) * 100) / 100;

  // 4. Post credit_note entry to DriverLedger
  const lastEntry = await DriverLedger.findOne({ driverId })
    .sort({ createdAt: -1 });
  const previousBalance = lastEntry?.runningBalance || 0;

  await DriverLedger.create({
    driverId,
    entryType: 'credit_note',
    credit: amount,
    debit: 0,
    runningBalance: previousBalance + amount,
    description: `Credit note: ${reason}`,
    referenceId: invoice.invoiceNo,
    period: invoice.period,
    createdBy,
  });

  // 5. Save and return
  await invoice.save();
  return invoice;
};

module.exports = {
  generateInvoice,
  addCreditNote,
};
