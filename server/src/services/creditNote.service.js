const { CreditNote, Driver, Client, Project, Invoice, DriverLedger, SalaryRun } = require('../models');
const { amountToWords } = require('../utils/numberToWords');

/**
 * Create a new credit note with multiple driver line items.
 */
const createCreditNote = async (data, createdBy) => {
  const { clientId, projectId, year, month, description, lineItems } = data;

  // Validate client and project exist
  const client = await Client.findById(clientId);
  if (!client) {
    const err = new Error('Client not found');
    err.statusCode = 404;
    throw err;
  }

  const project = await Project.findById(projectId);
  if (!project) {
    const err = new Error('Project not found');
    err.statusCode = 404;
    throw err;
  }

  // Build line items with driver lookup
  const processedItems = [];
  let subtotal = 0;
  let totalVat = 0;

  for (const item of lineItems) {
    const driver = await Driver.findById(item.driverId);
    if (!driver) {
      const err = new Error(`Driver not found: ${item.driverId}`);
      err.statusCode = 404;
      throw err;
    }

    const amount = Math.round(item.amount * 100) / 100;
    const vatRate = item.vatRate || 0;
    const vatAmount = Math.round(amount * vatRate * 100) / 100;
    const totalWithVat = Math.round((amount + vatAmount) * 100) / 100;

    processedItems.push({
      driverId: driver._id,
      driverName: driver.fullName,
      noteType: item.noteType,
      clientUserId: driver.clientUserId || '',
      employeeCode: driver.employeeCode || '',
      referenceNo: item.referenceNo || '',
      amount,
      vatRate,
      vatAmount,
      totalWithVat,
    });

    subtotal += amount;
    totalVat += vatAmount;
  }

  subtotal = Math.round(subtotal * 100) / 100;
  totalVat = Math.round(totalVat * 100) / 100;
  const totalAmount = Math.round((subtotal + totalVat) * 100) / 100;

  const creditNote = await CreditNote.create({
    clientId,
    projectId,
    period: { year, month },
    description,
    lineItems: processedItems,
    subtotal,
    totalVat,
    totalAmount,
    amountInWords: amountToWords(totalAmount),
    status: 'draft',
    createdBy,
  });

  // Notify accounts team
  try {
    const { notifyByPermission } = require('./notification.service');
    await notifyByPermission('credit_notes.adjust', {
      type: 'credit_note_created',
      title: 'New credit note created',
      message: `Credit note ${creditNote.creditNoteNo} created for ${client.name} — ${totalAmount} AED`,
      referenceModel: 'CreditNote',
      referenceId: creditNote._id,
      triggeredBy: createdBy,
    });
  } catch (_) {
    // Non-critical — don't fail the creation
  }

  return creditNote;
};

/**
 * Send credit note to client — status: draft → sent
 */
const sendCreditNote = async (creditNoteId, userId) => {
  const cn = await CreditNote.findById(creditNoteId);
  if (!cn) {
    const err = new Error('Credit note not found');
    err.statusCode = 404;
    throw err;
  }

  if (cn.status !== 'draft') {
    const err = new Error(`Cannot send credit note — must be in 'draft' status (current: '${cn.status}')`);
    err.statusCode = 400;
    throw err;
  }

  cn.status = 'sent';
  cn.sentAt = new Date();
  cn.sentBy = userId;
  await cn.save();

  // Auto-adjust: add credit note deductions to existing draft salary runs
  await adjustDraftSalaryRuns(cn);

  try {
    const { notifyByPermission } = require('./notification.service');
    await notifyByPermission('credit_notes.adjust', {
      type: 'credit_note_sent',
      title: 'Credit note sent to client',
      message: `Credit note ${cn.creditNoteNo} has been sent to the client.`,
      referenceModel: 'CreditNote',
      referenceId: cn._id,
      triggeredBy: userId,
    });
  } catch (_) {}

  return cn;
};

/**
 * Link credit note to an invoice (client confirms which invoice they adjusted).
 */
const adjustCreditNote = async (creditNoteId, invoiceId, userId) => {
  const cn = await CreditNote.findById(creditNoteId);
  if (!cn) {
    const err = new Error('Credit note not found');
    err.statusCode = 404;
    throw err;
  }

  if (cn.status !== 'sent') {
    const err = new Error(`Cannot adjust credit note — must be in 'sent' status (current: '${cn.status}')`);
    err.statusCode = 400;
    throw err;
  }

  const invoice = await Invoice.findById(invoiceId);
  if (!invoice) {
    const err = new Error('Invoice not found');
    err.statusCode = 404;
    throw err;
  }

  if (String(invoice.clientId) !== String(cn.clientId)) {
    const err = new Error('Invoice does not belong to the same client as the credit note');
    err.statusCode = 400;
    throw err;
  }

  // Update credit note
  cn.linkedInvoiceId = invoiceId;
  cn.clientAdjustedAt = new Date();
  cn.clientAdjustedBy = userId;
  cn.status = 'adjusted';
  await cn.save();

  // Add entry to Invoice.linkedCreditNotes[]
  invoice.linkedCreditNotes.push({
    creditNoteId: cn._id,
    creditNoteNo: cn.creditNoteNo,
    amount: cn.totalAmount,
    linkedAt: new Date(),
    linkedBy: userId,
  });

  // Recalculate adjustedTotal
  const totalLinkedCN = invoice.linkedCreditNotes.reduce((sum, lcn) => sum + (lcn.amount || 0), 0);
  invoice.adjustedTotal = Math.round((invoice.total - totalLinkedCN) * 100) / 100;
  await invoice.save();

  try {
    const { notifyByPermission } = require('./notification.service');
    await notifyByPermission('credit_notes.adjust', {
      type: 'credit_note_adjusted',
      title: 'Credit note linked to invoice',
      message: `Credit note ${cn.creditNoteNo} linked to invoice ${invoice.invoiceNo}.`,
      referenceModel: 'CreditNote',
      referenceId: cn._id,
      triggeredBy: userId,
    });
  } catch (_) {}

  return cn;
};

/**
 * Manually resolve a credit note line item (for resigned/offboarded drivers).
 */
const manuallyResolveLine = async (creditNoteId, lineItemId, note, userId) => {
  const cn = await CreditNote.findById(creditNoteId);
  if (!cn) {
    const err = new Error('Credit note not found');
    err.statusCode = 404;
    throw err;
  }

  const line = cn.lineItems.id(lineItemId);
  if (!line) {
    const err = new Error('Line item not found');
    err.statusCode = 404;
    throw err;
  }

  line.manuallyResolved = true;
  line.manualResolutionNote = note;
  line.manualResolvedBy = userId;
  line.manualResolvedAt = new Date();
  await cn.save();

  // Check if entire CN is now settled
  await checkAndSettleCreditNote(creditNoteId);

  return cn;
};

/**
 * Check if a credit note is fully settled (all lines settled + client side adjusted).
 */
const checkAndSettleCreditNote = async (creditNoteId) => {
  const cn = await CreditNote.findById(creditNoteId);
  if (!cn || cn.status === 'settled' || cn.status === 'cancelled') return cn;

  // Client side must be adjusted
  if (!cn.linkedInvoiceId) return cn;

  // All lines must be settled (salary deducted, manually resolved, or receivable created & resolved)
  const allSettled = cn.lineItems.every(
    (line) => line.salaryDeducted || line.manuallyResolved
  );

  if (allSettled) {
    cn.status = 'settled';
    await cn.save();

    try {
      const { notifyByPermission } = require('./notification.service');
      await notifyByPermission('credit_notes.adjust', {
        type: 'credit_note_settled',
        title: 'Credit note fully settled',
        message: `Credit note ${cn.creditNoteNo} is fully settled (all driver lines resolved + client adjusted).`,
        referenceModel: 'CreditNote',
        referenceId: cn._id,
      });
    } catch (_) {}
  }

  return cn;
};

/**
 * Get settlement status summary for a credit note.
 */
const getSettlementStatus = async (creditNoteId) => {
  const cn = await CreditNote.findById(creditNoteId);
  if (!cn) {
    const err = new Error('Credit note not found');
    err.statusCode = 404;
    throw err;
  }

  const driverLinesTotal = cn.lineItems.length;
  const driverLinesSettled = cn.lineItems.filter(
    (l) => l.salaryDeducted || l.manuallyResolved
  ).length;
  const driverLinesPending = cn.lineItems.filter(
    (l) => !l.salaryDeducted && !l.manuallyResolved
  ).length;
  const driverLinesPendingNextSalary = cn.lineItems.filter(
    (l) => l.pendingNextSalary && !l.salaryDeducted && !l.manuallyResolved
  ).length;
  const driverLinesWithReceivable = cn.lineItems.filter(
    (l) => l.receivableCreated && !l.manuallyResolved
  ).length;

  return {
    clientSettled: !!cn.linkedInvoiceId,
    driverLinesTotal,
    driverLinesSettled,
    driverLinesPending,
    driverLinesPendingNextSalary,
    driverLinesWithReceivable,
  };
};

/**
 * Record invoice payment and reconcile against credit notes.
 */
const recordInvoicePayment = async (invoiceId, data, userId) => {
  const { amountReceived, paymentReference, paymentDate } = data;

  const invoice = await Invoice.findById(invoiceId);
  if (!invoice) {
    const err = new Error('Invoice not found');
    err.statusCode = 404;
    throw err;
  }

  invoice.amountReceived = Math.round(amountReceived * 100) / 100;
  invoice.paymentReference = paymentReference || '';
  invoice.paymentDate = paymentDate ? new Date(paymentDate) : new Date();

  const expectedAmount = invoice.adjustedTotal != null ? invoice.adjustedTotal : invoice.total;
  invoice.paymentVariance = Math.round((invoice.amountReceived - expectedAmount) * 100) / 100;

  if (invoice.paymentVariance === 0) {
    invoice.status = 'paid';
    invoice.paidDate = invoice.paymentDate;
  }

  await invoice.save();
  return invoice;
};

/**
 * Generate Statement of Accounts for a project.
 */
const getStatementOfAccounts = async (projectId, year) => {
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // Fetch invoices for the project/year (exclude drafts)
  const invoices = await Invoice.find({
    projectId,
    'period.year': year,
    isDeleted: { $ne: true },
    status: { $ne: 'draft' },
  })
    .select('invoiceNo period total adjustedTotal amountReceived status linkedCreditNotes')
    .sort({ 'period.month': 1 })
    .lean();

  // Fetch credit notes for the project/year (exclude drafts)
  const creditNotes = await CreditNote.find({
    projectId,
    'period.year': year,
    isDeleted: { $ne: true },
    status: { $ne: 'draft' },
  })
    .select('creditNoteNo period totalAmount status linkedInvoiceId')
    .populate('linkedInvoiceId', 'invoiceNo')
    .sort({ 'period.month': 1 })
    .lean();

  // Build monthly breakdown
  const monthlyData = [];
  let yearlyTotalInvoiced = 0;
  let yearlyTotalCreditNotes = 0;
  let yearlyTotalReceived = 0;

  for (let m = 1; m <= 12; m++) {
    const monthInvoices = invoices.filter((inv) => inv.period.month === m);
    const monthCNs = creditNotes.filter((cn) => cn.period.month === m);

    const totalInvoiced = monthInvoices.reduce((s, inv) => s + (inv.total || 0), 0);
    const totalCN = monthCNs.reduce((s, cn) => s + (cn.totalAmount || 0), 0);
    const netReceivable = Math.round((totalInvoiced - totalCN) * 100) / 100;
    const totalReceived = monthInvoices.reduce((s, inv) => {
      if (inv.amountReceived > 0) return s + inv.amountReceived;
      if (inv.status === 'paid') return s + (inv.adjustedTotal != null ? inv.adjustedTotal : (inv.total || 0));
      return s;
    }, 0);
    const outstandingBalance = Math.round((netReceivable - totalReceived) * 100) / 100;

    yearlyTotalInvoiced += totalInvoiced;
    yearlyTotalCreditNotes += totalCN;
    yearlyTotalReceived += totalReceived;

    monthlyData.push({
      month: m,
      monthName: monthNames[m - 1],
      year,
      invoices: monthInvoices.map((inv) => ({
        invoiceNo: inv.invoiceNo,
        total: inv.total,
        adjustedTotal: inv.adjustedTotal,
        amountReceived: inv.amountReceived > 0 ? inv.amountReceived : (inv.status === 'paid' ? (inv.adjustedTotal != null ? inv.adjustedTotal : (inv.total || 0)) : 0),
        status: inv.status,
      })),
      creditNotes: monthCNs.map((cn) => ({
        creditNoteNo: cn.creditNoteNo,
        totalAmount: cn.totalAmount,
        status: cn.status,
        linkedInvoiceNo: cn.linkedInvoiceId?.invoiceNo || null,
      })),
      totalInvoiced: Math.round(totalInvoiced * 100) / 100,
      totalCreditNotes: Math.round(totalCN * 100) / 100,
      netReceivable,
      totalReceived: Math.round(totalReceived * 100) / 100,
      outstandingBalance,
    });
  }

  const yearlyNetReceivable = Math.round((yearlyTotalInvoiced - yearlyTotalCreditNotes) * 100) / 100;

  return {
    projectId,
    year,
    months: monthlyData,
    yearlyTotals: {
      totalInvoiced: Math.round(yearlyTotalInvoiced * 100) / 100,
      totalCreditNotes: Math.round(yearlyTotalCreditNotes * 100) / 100,
      netReceivable: yearlyNetReceivable,
      totalReceived: Math.round(yearlyTotalReceived * 100) / 100,
      outstandingBalance: Math.round((yearlyNetReceivable - yearlyTotalReceived) * 100) / 100,
    },
  };
};

/**
 * When a credit note is sent, find the first available draft salary run
 * for each affected driver (any period, not just same period) and inject
 * the credit note deduction.
 *
 * Decision tree when no draft salary exists:
 * 1. Driver is active → mark line as pendingNextSalary (auto-picked up by next payroll)
 * 2. Driver is resigned/offboarded → create a DriverReceivable
 */
const adjustDraftSalaryRuns = async (creditNote) => {
  const DriverReceivable = require('../models/DriverReceivable');

  const adjustmentSummary = {
    adjustedInSalary: [],
    pendingNextSalary: [],
    receivablesCreated: [],
  };

  for (const line of creditNote.lineItems) {
    if (line.salaryDeducted || line.manuallyResolved) continue;

    const refId = String(creditNote._id) + ':' + String(line._id);
    const deductionAmount = Math.round(line.totalWithVat * 100) / 100;

    // Find the FIRST available draft salary run for this driver (any period)
    const draftRun = await SalaryRun.findOne({
      driverId: line.driverId,
      status: 'draft',
      isDeleted: { $ne: true },
    }).sort({ 'period.year': 1, 'period.month': 1 });

    if (draftRun) {
      // Check if already added
      const alreadyAdded = draftRun.deductions.some(
        (d) => d.type === 'credit_note' && d.referenceId === refId
      );
      if (alreadyAdded) continue;

      draftRun.deductions.push({
        type: 'credit_note',
        referenceId: refId,
        amount: deductionAmount,
        description: `Credit note ${creditNote.creditNoteNo} - ${creditNote.description || line.noteType}`,
        status: 'applied',
      });

      draftRun.totalDeductions = Math.round(
        draftRun.deductions.filter((d) => d.amount > 0).reduce((sum, d) => sum + d.amount, 0) * 100
      ) / 100;
      draftRun.netSalary = Math.max(
        0,
        Math.round((draftRun.grossSalary - draftRun.totalDeductions) * 100) / 100
      );

      await draftRun.save();
      adjustmentSummary.adjustedInSalary.push({
        driverId: line.driverId,
        driverName: line.driverName,
        salaryRunId: draftRun.runId,
        period: draftRun.period,
      });
      continue;
    }

    // No draft salary found — check driver status
    const driver = await Driver.findById(line.driverId);
    if (!driver) continue;

    const isInactive = ['resigned', 'offboarded'].includes(driver.status);

    if (!isInactive) {
      // Driver is active — mark as pending, will be picked up by next payroll run
      line.pendingNextSalary = true;
      line.pendingNextSalaryAt = new Date();
      adjustmentSummary.pendingNextSalary.push({
        driverId: line.driverId,
        driverName: line.driverName,
      });
    } else {
      // Driver is resigned/offboarded — create a DriverReceivable
      const receivable = await DriverReceivable.create({
        driverId: driver._id,
        driverName: driver.fullName,
        employeeCode: driver.employeeCode,
        creditNoteId: creditNote._id,
        creditNoteNo: creditNote.creditNoteNo,
        lineItemId: line._id,
        amount: deductionAmount,
        reason: driver.status === 'resigned' ? 'driver_resigned' : 'driver_offboarded',
        clientId: creditNote.clientId,
        projectId: creditNote.projectId,
        createdBy: creditNote.sentBy,
      });

      line.receivableCreated = true;
      line.receivableId = receivable._id;

      // Post ledger entry for visibility
      await DriverLedger.create({
        driverId: driver._id,
        entryType: 'credit_note_debit',
        debit: deductionAmount,
        credit: 0,
        description: `Receivable created — Credit note ${creditNote.creditNoteNo} - ${line.noteType} (driver ${driver.status})`,
        referenceId: String(receivable._id),
        period: creditNote.period,
        createdBy: creditNote.sentBy,
      });

      adjustmentSummary.receivablesCreated.push({
        driverId: line.driverId,
        driverName: line.driverName,
        receivableNo: receivable.receivableNo,
        amount: deductionAmount,
      });
    }
  }

  // Save updated line items (pendingNextSalary / receivableCreated flags)
  await creditNote.save();

  // Send notifications for items that couldn't be auto-adjusted
  try {
    const { notifyByPermission } = require('./notification.service');

    if (adjustmentSummary.pendingNextSalary.length > 0) {
      const driverNames = adjustmentSummary.pendingNextSalary.map((d) => d.driverName).join(', ');
      await notifyByPermission('salary.approve_accounts', {
        type: 'credit_note_pending_salary',
        title: 'Credit note pending salary adjustment',
        message: `Credit note ${creditNote.creditNoteNo}: No draft salary found for ${driverNames}. Deduction will be auto-applied in next payroll run.`,
        referenceModel: 'CreditNote',
        referenceId: creditNote._id,
        triggeredBy: creditNote.sentBy,
      });
    }

    if (adjustmentSummary.receivablesCreated.length > 0) {
      const totalReceivable = adjustmentSummary.receivablesCreated.reduce((s, r) => s + r.amount, 0);
      await notifyByPermission('receivables.view', {
        type: 'driver_receivable_created',
        title: 'Driver receivable created from credit note',
        message: `Credit note ${creditNote.creditNoteNo}: ${adjustmentSummary.receivablesCreated.length} receivable(s) created totalling ${totalReceivable} AED for resigned/offboarded drivers.`,
        referenceModel: 'CreditNote',
        referenceId: creditNote._id,
        triggeredBy: creditNote.sentBy,
      });
    }
  } catch (_) {
    // Non-critical — don't fail the send
  }

  return adjustmentSummary;
};

module.exports = {
  createCreditNote,
  sendCreditNote,
  adjustCreditNote,
  manuallyResolveLine,
  checkAndSettleCreditNote,
  getSettlementStatus,
  recordInvoicePayment,
  getStatementOfAccounts,
};
