const { getModel } = require('../../config/modelRegistry');
const { computeLineAmount, computeOTLineAmount } = require('../../utils/rateCalculator');

const VAT_RATE = 0.05;

const generateInvoice = async (req, clientId, year, month, createdBy, { projectId, attendanceBatchIds, invoiceType } = {}) => {
  if (invoiceType === 'overtime') {
    return generateOTInvoice(req, clientId, year, month, createdBy, { projectId, attendanceBatchIds });
  }
  const Client = getModel(req, 'Client');
  const Invoice = getModel(req, 'Invoice');
  const SalaryRun = getModel(req, 'SalaryRun');
  const Project = getModel(req, 'Project');
  const AttendanceBatch = getModel(req, 'AttendanceBatch');
  const AttendanceRecord = getModel(req, 'AttendanceRecord');
  const DriverProjectAssignment = getModel(req, 'DriverProjectAssignment');
  // Fetch client for fallback rate and payment terms
  const client = await Client.findById(clientId);
  if (!client) {
    const err = new Error('Client not found');
    err.statusCode = 404;
    throw err;
  }

  const fallbackRate = 0;

  // If attendanceBatchIds are provided, generate from attendance batches
  if (attendanceBatchIds && attendanceBatchIds.length > 0) {
    return generateFromAttendanceBatches(req, client, year, month, createdBy, projectId, attendanceBatchIds);
  }

  // Auto-discover approved attendance batches for this client/period
  const batchQuery = {
    clientId,
    status: { $in: ['fully_approved', 'processed', 'invoiced'] },
    'period.year': year,
    'period.month': month,
  };
  if (projectId) {
    batchQuery.projectId = projectId;
  }

  const approvedBatches = await AttendanceBatch.find(batchQuery).select('_id invoiceId');

  if (approvedBatches.length > 0) {
    // Filter out batches that still have an active (non-deleted) invoice
    const batchesWithInvoice = approvedBatches.filter((b) => b.invoiceId);
    let activeInvoiceIds = new Set();
    if (batchesWithInvoice.length > 0) {
      const invoiceIds = [...new Set(batchesWithInvoice.map((b) => b.invoiceId.toString()))];
      const existing = await Invoice.find({ _id: { $in: invoiceIds }, isDeleted: { $ne: true } }).select('_id');
      activeInvoiceIds = new Set(existing.map((inv) => inv._id.toString()));
    }
    const availableBatches = approvedBatches.filter((b) => !b.invoiceId || !activeInvoiceIds.has(b.invoiceId.toString()));

    if (availableBatches.length > 0) {
      const batchIds = availableBatches.map((b) => b._id);
      return generateFromAttendanceBatches(req, client, year, month, createdBy, projectId, batchIds);
    }
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
    isDeleted: { $ne: true },
  };
  if (projectId) {
    salaryQuery.projectId = projectId;
  }

  const salaryRuns = await SalaryRun.find(salaryQuery).populate('driverId', 'employeeCode fullName');

  if (salaryRuns.length === 0) {
    const err = new Error('No approved salary runs or attendance batches found for this client/period');
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
      const { dailyRate, amount } = computeLineAmount(rate, rateBasis, run.workingDays, {
        year, month, totalOrders: run.totalOrders || 0,
      });
      return {
        driverId: run.driverId._id,
        employeeCode: run.driverId.employeeCode,
        driverName: run.driverId.fullName,
        workingDays: run.workingDays,
        totalOrders: run.totalOrders || 0,
        ratePerDriver: rate,
        ratePerDay: Math.round(dailyRate * 100) / 100,
        rateBasis,
        amount,
      };
    });

    const subtotal = drivers.reduce((sum, d) => sum + d.amount, 0);

    projectGroups.push({
      projectId: proj._id || key,
      projectName: proj.name || 'Unknown project',
      projectCode: proj.projectCode || '',
      ratePerDriver: proj.ratePerDriver || fallbackRate,
      rateBasis,
      drivers,
      driverCount: drivers.length,
      subtotal: Math.round(subtotal * 100) / 100,
    });
  }

  if (unassignedRuns.length > 0) {
    const drivers = unassignedRuns.map((run) => {
      const { dailyRate, amount } = computeLineAmount(fallbackRate, 'monthly_fixed', run.workingDays, {
        year, month,
      });
      return {
        driverId: run.driverId._id,
        employeeCode: run.driverId.employeeCode,
        driverName: run.driverId.fullName,
        workingDays: run.workingDays,
        ratePerDriver: fallbackRate,
        ratePerDay: Math.round(dailyRate * 100) / 100,
        amount,
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
const generateFromAttendanceBatches = async (req, client, year, month, createdBy, projectId, attendanceBatchIds) => {
  const AttendanceBatch = getModel(req, 'AttendanceBatch');
  const AttendanceRecord = getModel(req, 'AttendanceRecord');
  const Invoice = getModel(req, 'Invoice');
  const DriverProjectAssignment = getModel(req, 'DriverProjectAssignment');
  // Validate all batches exist and are approved (fully_approved, processed, or invoiced with deleted invoice)
  const batches = await AttendanceBatch.find({
    _id: { $in: attendanceBatchIds },
    clientId: client._id,
    status: { $in: ['fully_approved', 'processed', 'invoiced'] },
  });

  if (batches.length !== attendanceBatchIds.length) {
    const err = new Error('Some attendance batches are invalid, already invoiced, or not fully approved');
    err.statusCode = 400;
    throw err;
  }

  // Check if any batch has a stale invoiceId (invoice was deleted but invoiceId not cleared)
  const batchesWithInvoiceId = batches.filter((b) => b.invoiceId);
  if (batchesWithInvoiceId.length > 0) {
    const invoiceIds = [...new Set(batchesWithInvoiceId.map((b) => b.invoiceId.toString()))];
    const existingInvoices = await Invoice.find({
      _id: { $in: invoiceIds },
      isDeleted: { $ne: true },
    }).select('_id');
    const activeInvoiceIds = new Set(existingInvoices.map((inv) => inv._id.toString()));

    const trulyInvoiced = batchesWithInvoiceId.filter((b) => activeInvoiceIds.has(b.invoiceId.toString()));
    if (trulyInvoiced.length > 0) {
      const ids = trulyInvoiced.map((b) => b.batchId).join(', ');
      const err = new Error(`Batch(es) ${ids} already have an invoice generated. Delete the existing invoice first.`);
      err.statusCode = 400;
      throw err;
    }

    // Clear stale invoiceId references from batches whose invoice was deleted
    const staleBatchIds = batchesWithInvoiceId
      .filter((b) => !activeInvoiceIds.has(b.invoiceId.toString()))
      .map((b) => b._id);
    if (staleBatchIds.length > 0) {
      await AttendanceBatch.updateMany(
        { _id: { $in: staleBatchIds } },
        { $set: { invoiceId: null, invoicedAt: null, invoicedBy: null } }
      );
    }
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

    let ratePerDriver = project.ratePerDriver || 0;

    const activeAssignment = await DriverProjectAssignment.findOne({
      driverId: driver._id,
      projectId: project._id,
      status: 'active',
    }).select('ratePerDriver');

    if (activeAssignment?.ratePerDriver) {
      ratePerDriver = activeAssignment.ratePerDriver;
    }

    const rateBasis = project.rateBasis || 'monthly_fixed';
    const { dailyRate, amount } = computeLineAmount(ratePerDriver, rateBasis, record.workingDays, {
      year, month, totalOrders: record.totalOrders || 0,
    });

    projectMap[projKey].ratePerDriver = ratePerDriver;
    projectMap[projKey].dailyRate = parseFloat(dailyRate.toFixed(4));
    projectMap[projKey].rateBasis = rateBasis;
    projectMap[projKey].drivers.push({
      driverId: driver._id,
      driverName: driver.fullName,
      employeeCode: driver.employeeCode,
      workingDays: record.workingDays,
      totalOrders: record.totalOrders || 0,
      overtimeHours: record.overtimeHours || 0,
      ratePerDriver: ratePerDriver,
      ratePerDay: parseFloat(dailyRate.toFixed(2)),
      rateBasis,
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

/**
 * Generate a standalone Overtime invoice.
 *
 * Sources the project's `otRate` / `otRateBasis` (active contract overrides
 * the project default) and bills the `overtimeHours` from the selected
 * attendance batches' records. Skips records with zero OT.
 */
const generateOTInvoice = async (req, clientId, year, month, createdBy, { projectId, attendanceBatchIds } = {}) => {
  const Client = getModel(req, 'Client');
  const Invoice = getModel(req, 'Invoice');
  const Project = getModel(req, 'Project');
  const ProjectContract = getModel(req, 'ProjectContract');
  const AttendanceBatch = getModel(req, 'AttendanceBatch');
  const AttendanceRecord = getModel(req, 'AttendanceRecord');

  const client = await Client.findById(clientId);
  if (!client) {
    const err = new Error('Client not found');
    err.statusCode = 404;
    throw err;
  }

  // Collect candidate batches: provided list or auto-discover approved ones
  let batchIds = attendanceBatchIds;
  if (!batchIds || batchIds.length === 0) {
    const batchQuery = {
      clientId,
      status: { $in: ['fully_approved', 'processed', 'invoiced'] },
      'period.year': year,
      'period.month': month,
    };
    if (projectId) batchQuery.projectId = projectId;
    const found = await AttendanceBatch.find(batchQuery).select('_id');
    batchIds = found.map((b) => b._id);
  }

  if (!batchIds || batchIds.length === 0) {
    const err = new Error('No approved attendance batches found for this client/period to generate OT invoice');
    err.statusCode = 400;
    throw err;
  }

  // Reject if an OT invoice already exists for this client/project/period
  const dupQuery = {
    clientId,
    invoiceType: 'overtime',
    'period.year': year,
    'period.month': month,
    isDeleted: { $ne: true },
  };
  if (projectId) dupQuery.projectId = projectId;
  const existing = await Invoice.findOne(dupQuery);
  if (existing) {
    const err = new Error(`OT invoice already exists for this period: ${existing.invoiceNo}`);
    err.statusCode = 409;
    throw err;
  }

  const recordQuery = { batchId: { $in: batchIds } };
  if (projectId) recordQuery.projectId = projectId;

  const records = await AttendanceRecord.find(recordQuery)
    .populate({ path: 'driverId', select: 'fullName employeeCode' })
    .populate({ path: 'projectId', select: 'name projectCode otRate otRateBasis' })
    .lean();

  if (!records.length) {
    const err = new Error('No attendance records found for the selected batches');
    err.statusCode = 400;
    throw err;
  }

  // Cache active-contract OT rate per project so we don't refetch per record
  const projectOTCache = {};
  const resolveOTRate = async (project) => {
    if (!project?._id) return { otRate: 0, otRateBasis: 'per_hour' };
    const key = project._id.toString();
    if (projectOTCache[key]) return projectOTCache[key];
    let otRate = project.otRate || 0;
    let otRateBasis = project.otRateBasis || 'per_hour';
    const activeContract = await ProjectContract.findOne({
      projectId: project._id,
      status: 'active',
    }).select('otRate otRateBasis').lean();
    if (activeContract?.otRate) otRate = activeContract.otRate;
    if (activeContract?.otRateBasis) otRateBasis = activeContract.otRateBasis;
    projectOTCache[key] = { otRate, otRateBasis };
    return projectOTCache[key];
  };

  const projectMap = {};
  let resolvedProjectId = projectId || null;

  for (const record of records) {
    const driver = record.driverId;
    const project = record.projectId;
    if (!driver || !project) continue;

    const overtimeHours = Number(record.overtimeHours) || 0;
    if (overtimeHours <= 0) continue;

    const { otRate, otRateBasis } = await resolveOTRate(project);
    if (!otRate || otRate <= 0) continue;

    const { amount } = computeOTLineAmount(otRate, otRateBasis, overtimeHours);
    if (amount <= 0) continue;

    const projKey = project._id.toString();
    if (!projectMap[projKey]) {
      projectMap[projKey] = {
        projectId: project._id,
        projectName: project.name,
        projectCode: project.projectCode,
        otRate,
        otRateBasis,
        drivers: [],
        subtotal: 0,
      };
    }

    projectMap[projKey].drivers.push({
      driverId: driver._id,
      driverName: driver.fullName,
      employeeCode: driver.employeeCode,
      overtimeHours,
      otRate,
      otRateBasis,
      amount,
    });
    projectMap[projKey].subtotal += amount;
  }

  const projectGroups = Object.values(projectMap);
  if (!projectGroups.length) {
    const err = new Error(
      'No billable overtime found. Ensure attendance records have overtimeHours and the project has an OT rate configured.'
    );
    err.statusCode = 400;
    throw err;
  }

  if (!resolvedProjectId && projectGroups.length === 1) {
    resolvedProjectId = projectGroups[0].projectId;
  }

  const lineItems = projectGroups.flatMap((g) => g.drivers).map((d) => {
    const vatAmt = parseFloat((d.amount * VAT_RATE).toFixed(2));
    return {
      driverId: d.driverId,
      driverName: d.driverName,
      employeeCode: d.employeeCode,
      overtimeHours: d.overtimeHours,
      otRate: d.otRate,
      otRateBasis: d.otRateBasis,
      amount: d.amount,
      vatRate: VAT_RATE,
      vatAmount: vatAmt,
      totalWithVat: parseFloat((d.amount + vatAmt).toFixed(2)),
    };
  });

  const subtotal = parseFloat(projectGroups.reduce((sum, g) => sum + g.subtotal, 0).toFixed(2));
  const vatAmount = parseFloat((subtotal * VAT_RATE).toFixed(2));
  const total = parseFloat((subtotal + vatAmount).toFixed(2));

  const servicePeriodFrom = new Date(year, month - 1, 1);
  const servicePeriodTo = new Date(year, month, 0);

  const issuedDate = new Date();
  const paymentDays = parseInt(client.paymentTerms?.replace(/\D/g, '')) || 30;
  const dueDate = new Date(issuedDate);
  dueDate.setDate(dueDate.getDate() + paymentDays);

  const invoice = await Invoice.create({
    clientId,
    projectId: resolvedProjectId || undefined,
    invoiceType: 'overtime',
    period: { year, month },
    servicePeriodFrom,
    servicePeriodTo,
    lineItems,
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

module.exports = {
  generateInvoice,
  generateOTInvoice,
};
