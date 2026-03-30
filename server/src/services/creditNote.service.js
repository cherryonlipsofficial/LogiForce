const { CreditNote, Driver, Client, Project, Invoice, DriverLedger } = require('../models');
const { amountToWords } = require('../utils/numberToWords');

/**
 * Create a new credit note with multiple driver line items.
 */
const createCreditNote = async (data, createdBy) => {
  const { clientId, projectId, year, month, description, noteType, lineItems } = data;

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
    noteType,
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
    const { notifyByRole } = require('./notification.service');
    await notifyByRole(['accountant'], {
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

  try {
    const { notifyByRole } = require('./notification.service');
    await notifyByRole(['accountant'], {
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
    const { notifyByRole } = require('./notification.service');
    await notifyByRole(['accountant'], {
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

  // All lines must be settled
  const allSettled = cn.lineItems.every(
    (line) => line.salaryDeducted || line.manuallyResolved
  );

  if (allSettled) {
    cn.status = 'settled';
    await cn.save();

    try {
      const { notifyByRole } = require('./notification.service');
      await notifyByRole(['accountant'], {
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

  return {
    clientSettled: !!cn.linkedInvoiceId,
    driverLinesTotal,
    driverLinesSettled,
    driverLinesPending,
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

  // Fetch invoices for the project/year
  const invoices = await Invoice.find({
    projectId,
    'period.year': year,
    isDeleted: { $ne: true },
  })
    .select('invoiceNo period total adjustedTotal amountReceived status linkedCreditNotes')
    .sort({ 'period.month': 1 })
    .lean();

  // Fetch credit notes for the project/year
  const creditNotes = await CreditNote.find({
    projectId,
    'period.year': year,
    isDeleted: { $ne: true },
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
    const totalReceived = monthInvoices.reduce((s, inv) => s + (inv.amountReceived || 0), 0);
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
        amountReceived: inv.amountReceived || 0,
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
