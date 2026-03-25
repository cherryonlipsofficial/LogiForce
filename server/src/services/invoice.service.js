const { Invoice, SalaryRun, Client, Driver, DriverLedger, Project } = require('../models');

const generateInvoice = async (clientId, year, month, createdBy) => {
  // 1. Check no invoice already exists for this client/period
  const existing = await Invoice.findOne({
    clientId,
    'period.year': year,
    'period.month': month,
  });
  if (existing) {
    const err = new Error(`Invoice already exists for this client/period: ${existing.invoiceNo}`);
    err.statusCode = 409;
    throw err;
  }

  // 2. Fetch all approved salary runs for this client/period
  const salaryRuns = await SalaryRun.find({
    clientId,
    'period.year': year,
    'period.month': month,
    status: 'approved',
  }).populate('driverId', 'employeeCode fullName');

  if (salaryRuns.length === 0) {
    const err = new Error('No approved salary runs found for this client/period');
    err.statusCode = 400;
    throw err;
  }

  // Fetch client for fallback rate and payment terms
  const client = await Client.findById(clientId);
  if (!client) {
    const err = new Error('Client not found');
    err.statusCode = 404;
    throw err;
  }

  const fallbackRate = client.ratePerDriver || 0;

  // 3. Group salary runs by projectId
  const grouped = {};          // projectId.toString() -> { runs, projectDoc }
  const unassignedRuns = [];   // runs without a project

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
      .select('name projectCode ratePerDriver')
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

    const drivers = runs.map((run) => {
      // Use the rate snapshot stored on the salary run, else project rate, else client fallback
      const monthlyRate = run.projectRatePerDriver || proj.ratePerDriver || fallbackRate;
      const ratePerDay = monthlyRate / 26;
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

  // Handle unassigned drivers (no project) — group under a "No project" section
  if (unassignedRuns.length > 0) {
    const drivers = unassignedRuns.map((run) => {
      const ratePerDay = fallbackRate / 26;
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

  // 5. Build flat lineItems for backward compatibility
  const lineItems = projectGroups.flatMap((g) => g.drivers);

  // 6. Calculate totals
  const subtotal = projectGroups.reduce((sum, g) => sum + g.subtotal, 0);
  const vatRate = 0.05;
  const vatAmount = Math.round(subtotal * vatRate * 100) / 100;
  const total = Math.round((subtotal + vatAmount) * 100) / 100;

  // 7. Dates
  const issuedDate = new Date();
  const paymentDays = parseInt(client.paymentTerms?.replace(/\D/g, '')) || 30;
  const dueDate = new Date(issuedDate);
  dueDate.setDate(dueDate.getDate() + paymentDays);

  // 8. Create Invoice
  const invoice = await Invoice.create({
    clientId,
    period: { year, month },
    lineItems,
    projectGroups,
    driverCount: lineItems.length,
    subtotal,
    vatRate,
    vatAmount,
    total,
    status: 'draft',
    issuedDate,
    dueDate,
    createdBy,
  });

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
