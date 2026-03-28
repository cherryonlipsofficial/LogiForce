const {
  AttendanceBatch,
  AttendanceRecord,
  DriverProjectAssignment,
  Invoice,
  User,
} = require('../models');
const { notifyByRole } = require('./notification.service');

const MONTH_NAMES = [
  '', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const STANDARD_DAYS = 26;
const VAT_RATE = 0.05;

/**
 * Generate an invoice from a fully approved attendance batch.
 */
async function generateInvoiceFromBatch(batchId, accountsUserId) {
  // STEP 1 — Validate batch
  const batch = await AttendanceBatch.findById(batchId)
    .populate('clientId', 'name vatNo paymentTerms');

  if (!batch) {
    const err = new Error('Batch not found');
    err.statusCode = 404;
    throw err;
  }

  if (batch.status !== 'fully_approved') {
    const err = new Error(
      `Cannot generate invoice — batch status is "${batch.status}". Both Sales and Operations must approve first.`
    );
    err.statusCode = 400;
    throw err;
  }

  if (batch.invoiceId) {
    const err = new Error('An invoice has already been generated for this batch.');
    err.statusCode = 400;
    throw err;
  }

  // STEP 2 — Fetch attendance records
  const records = await AttendanceRecord.find({ batchId })
    .populate({
      path: 'driverId',
      select: 'fullName employeeCode projectId currentVehicleId',
      populate: {
        path: 'projectId',
        select: 'name projectCode ratePerDriver clientId',
      },
    })
    .lean();

  if (!records.length) {
    const err = new Error('No attendance records found for this batch.');
    err.statusCode = 400;
    throw err;
  }

  // STEP 3 — Group records by project
  const projectMap = {};

  for (const record of records) {
    const driver = record.driverId;
    const project = driver?.projectId;

    if (!project) {
      console.warn(`Driver ${driver?.employeeCode} has no project assigned`);
      continue;
    }

    const projectId = project._id.toString();
    if (!projectMap[projectId]) {
      projectMap[projectId] = {
        projectId: project._id,
        projectName: project.name,
        projectCode: project.projectCode,
        ratePerDriver: 0,
        dailyRate: 0,
        drivers: [],
        driverCount: 0,
        subtotal: 0,
      };
    }

    // Get billing rate
    let ratePerDriver = project.ratePerDriver;

    const activeAssignment = await DriverProjectAssignment.findOne({
      driverId: driver._id,
      projectId: project._id,
      status: 'active',
    }).select('ratePerDriver');

    if (activeAssignment?.ratePerDriver) {
      ratePerDriver = activeAssignment.ratePerDriver;
    }

    const dailyRate = ratePerDriver / STANDARD_DAYS;
    const amount = parseFloat((dailyRate * record.workingDays).toFixed(2));

    projectMap[projectId].ratePerDriver = ratePerDriver;
    projectMap[projectId].dailyRate = parseFloat(dailyRate.toFixed(4));
    projectMap[projectId].drivers.push({
      driverId: driver._id,
      driverName: driver.fullName,
      employeeCode: driver.employeeCode,
      workingDays: record.workingDays,
      overtimeHours: record.overtimeHours || 0,
      amount,
    });
    projectMap[projectId].subtotal += amount;
  }

  // STEP 4 — Build project groups array
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

  // STEP 5 — Calculate totals
  const subtotal = parseFloat(
    projectGroups.reduce((sum, pg) => sum + pg.subtotal, 0).toFixed(2)
  );
  const vatAmount = parseFloat((subtotal * VAT_RATE).toFixed(2));
  const total = parseFloat((subtotal + vatAmount).toFixed(2));

  // STEP 6 — Generate invoice number
  const monthStr = String(batch.period.month).padStart(2, '0');
  const yearStr = String(batch.period.year);
  const count = await Invoice.countDocuments() + 1;
  const invoiceNo = `INV-${yearStr}-${monthStr}-${String(count).padStart(4, '0')}`;

  // STEP 7 — Calculate due date
  const paymentTerms = batch.clientId.paymentTerms || 'Net 30';
  const termDays = parseInt(paymentTerms.replace(/\D/g, '')) || 30;
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + termDays);

  // STEP 8 — Create Invoice document
  const invoice = await Invoice.create({
    invoiceNo,
    clientId: batch.clientId._id,
    attendanceBatchId: batchId,
    period: batch.period,
    projectGroups,
    subtotal,
    vatRate: VAT_RATE,
    vatAmount,
    total,
    status: 'draft',
    issuedDate: new Date(),
    dueDate,
    createdBy: accountsUserId,
  });

  // STEP 9 — Update batch to invoiced status
  batch.status = 'invoiced';
  batch.invoiceId = invoice._id;
  batch.invoicedAt = new Date();
  batch.invoicedBy = accountsUserId;
  await batch.save();

  // STEP 10 — Notify Sales and Ops
  const accountsUser = await User.findById(accountsUserId).select('name');
  const monthName = MONTH_NAMES[batch.period.month] || '';

  await notifyByRole(['sales', 'operations', 'ops'], {
    type: 'invoice_generated',
    title: 'Invoice generated',
    message: `Invoice ${invoiceNo} has been generated for ${batch.clientId.name} — ${monthName} ${batch.period.year}. Total: AED ${total.toLocaleString()}`,
    referenceModel: 'Invoice',
    referenceId: invoice._id,
    triggeredBy: accountsUserId,
    triggeredByName: accountsUser?.name || 'System',
  });

  // STEP 11 — Return
  return {
    invoice: await Invoice.findById(invoice._id)
      .populate('clientId', 'name vatNo')
      .populate('createdBy', 'name'),
    summary: {
      invoiceNo,
      clientName: batch.clientId.name,
      period: batch.period,
      projectCount: projectGroups.length,
      driverCount: projectGroups.reduce((s, pg) => s + pg.driverCount, 0),
      subtotal,
      vatAmount,
      total,
    },
  };
}

module.exports = { generateInvoiceFromBatch };
