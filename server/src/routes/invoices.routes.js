const express = require('express');
const router = express.Router();
const { protect, requirePermission } = require('../middleware/auth');
const invoiceService = require('../services/invoice.service');
const { Invoice, Client, AttendanceBatch } = require('../models');
const { sendSuccess, sendError, sendPaginated } = require('../utils/responseHelper');
const { generateInvoicePDF } = require('../utils/pdfGenerator');
const { PAGINATION } = require('../config/constants');
const validate = require('../middleware/validate');
const { generateInvoiceValidation, updateInvoiceStatusValidation, creditNoteValidation } = require('../middleware/validators/invoice.validators');

// All routes are protected
router.use(protect);

// GET /api/invoices/approved-batches — get fully approved attendance batches for invoice generation
router.get('/approved-batches', async (req, res) => {
  const query = { status: { $in: ['fully_approved', 'processed', 'invoiced'] } };
  if (req.query.clientId) query.clientId = req.query.clientId;
  if (req.query.projectId) query.projectId = req.query.projectId;
  if (req.query.year) query['period.year'] = parseInt(req.query.year);
  if (req.query.month) query['period.month'] = parseInt(req.query.month);

  try {
    const batches = await AttendanceBatch.find(query)
      .populate('clientId', 'name')
      .populate('projectId', 'name projectCode')
      .select('batchId clientId projectId period totalRows matchedRows status createdAt invoiceId')
      .sort({ 'period.year': -1, 'period.month': -1, createdAt: -1 })
      .limit(100);

    // Filter out batches that have an active (non-deleted) invoice
    const batchesWithInvoice = batches.filter((b) => b.invoiceId);
    let activeInvoiceIds = new Set();
    if (batchesWithInvoice.length > 0) {
      const invoiceIds = [...new Set(batchesWithInvoice.map((b) => b.invoiceId.toString()))];
      const existing = await Invoice.find({ _id: { $in: invoiceIds }, isDeleted: { $ne: true } }).select('_id');
      activeInvoiceIds = new Set(existing.map((inv) => inv._id.toString()));
    }

    const available = batches.filter((b) => !b.invoiceId || !activeInvoiceIds.has(b.invoiceId.toString()));

    sendSuccess(res, available);
  } catch (err) {
    sendError(res, err.message || 'Failed to fetch approved batches', 500);
  }
});

// POST /api/invoices/generate — generate invoice for client/period
router.post('/generate', requirePermission('invoices.generate'), validate(generateInvoiceValidation), async (req, res) => {
  const { clientId, year, month, projectId, attendanceBatchIds } = req.body;

  const invoice = await invoiceService.generateInvoice(
    clientId,
    parseInt(year),
    parseInt(month),
    req.user._id,
    { projectId, attendanceBatchIds }
  );

  sendSuccess(res, invoice, 'Invoice generated successfully', 201);
});

// GET /api/invoices — list with filters
router.get('/', requirePermission('invoices.view'), async (req, res) => {
  const page = parseInt(req.query.page) || PAGINATION.DEFAULT_PAGE;
  const limit = parseInt(req.query.limit) || PAGINATION.DEFAULT_LIMIT;
  const skip = (page - 1) * limit;

  const query = { isDeleted: { $ne: true } };
  if (req.query.clientId) query.clientId = req.query.clientId;
  if (req.query.status) query.status = req.query.status;
  if (req.query.year) query['period.year'] = parseInt(req.query.year);
  if (req.query.month) query['period.month'] = parseInt(req.query.month);

  const [invoices, total] = await Promise.all([
    Invoice.find(query)
      .populate('clientId', 'name')
      .populate('projectId', 'name projectCode')
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Invoice.countDocuments(query),
  ]);

  sendPaginated(res, invoices, total, page, limit);
});

// GET /api/invoices/:id — get invoice with line items
router.get('/:id', requirePermission('invoices.view'), async (req, res) => {
  const invoice = await Invoice.findOne({ _id: req.params.id, isDeleted: { $ne: true } })
    .populate('clientId')
    .populate('createdBy', 'name')
    .populate('lineItems.driverId', 'fullName employeeCode clientUserId')
    .populate('creditNotes.driverId', 'fullName employeeCode');

  if (!invoice) return sendError(res, 'Invoice not found', 404);
  sendSuccess(res, invoice);
});

// PUT /api/invoices/:id/status — update status
router.put('/:id/status', requirePermission('invoices.edit'), validate(updateInvoiceStatusValidation), async (req, res) => {
  const { status } = req.body;

  const invoice = await Invoice.findById(req.params.id);
  if (!invoice) return sendError(res, 'Invoice not found', 404);

  if (invoice.status === 'cancelled') {
    return sendError(res, 'Cannot update a cancelled invoice', 400);
  }

  invoice.status = status;
  if (status === 'paid') invoice.paidDate = new Date();
  await invoice.save();

  sendSuccess(res, invoice, `Invoice status updated to ${status}`);
});

// POST /api/invoices/:id/credit-note — add credit note
router.post('/:id/credit-note', requirePermission('invoices.credit_note'), validate(creditNoteValidation), async (req, res) => {
  const { driverId, amount, reason } = req.body;

  const invoice = await invoiceService.addCreditNote(
    req.params.id,
    { driverId, amount: parseFloat(amount), reason },
    req.user._id
  );

  sendSuccess(res, invoice, 'Credit note added successfully');
});

// GET /api/invoices/:id/pdf — generate PDF
router.get('/:id/pdf', requirePermission('invoices.download'), async (req, res) => {
  const invoice = await Invoice.findById(req.params.id)
    .populate('clientId')
    .populate('projectId', 'name projectCode ratePerDriver')
    .populate('lineItems.driverId', 'fullName employeeCode clientUserId')
    .populate('creditNotes.driverId', 'fullName employeeCode');

  if (!invoice) return sendError(res, 'Invoice not found', 404);

  const client = invoice.clientId;
  if (!client) return sendError(res, 'Client not found', 404);

  const project = invoice.projectId;

  const CompanySettings = require('../models/CompanySettings');
  const companySettings = await CompanySettings.getSettings();

  const pdfBuffer = await generateInvoicePDF(invoice, client, project, companySettings);

  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `inline; filename="${invoice.invoiceNo}.pdf"`,
    'Content-Length': pdfBuffer.length,
  });
  res.send(pdfBuffer);
});

// PUT /api/invoices/:id/payment — record payment received
router.put('/:id/payment', requirePermission('invoices.edit'), async (req, res) => {
  const { amountReceived, paymentReference, paymentDate } = req.body;
  if (!amountReceived || amountReceived <= 0) {
    return sendError(res, 'amountReceived is required and must be positive', 400);
  }

  const creditNoteService = require('../services/creditNote.service');
  const invoice = await creditNoteService.recordInvoicePayment(
    req.params.id,
    { amountReceived: parseFloat(amountReceived), paymentReference, paymentDate },
    req.user._id
  );

  sendSuccess(res, invoice, 'Payment recorded successfully');
});

// DELETE /api/invoices/:id — delete invoice (soft delete if paid, hard delete otherwise)
router.delete('/:id', requirePermission('invoices.delete'), async (req, res) => {
  const invoice = await Invoice.findOne({ _id: req.params.id, isDeleted: { $ne: true } });
  if (!invoice) return sendError(res, 'Invoice not found', 404);

  if (invoice.status === 'paid') {
    const { remark } = req.body;
    if (!remark || remark.trim().length < 3) {
      return sendError(res, 'Remark is mandatory for deleting a paid invoice (minimum 3 characters)', 400);
    }

    invoice.isDeleted = true;
    invoice.deletedAt = new Date();
    invoice.deletedBy = req.user._id;
    invoice.deleteRemark = remark.trim();
    await invoice.save();

    // Reset attendance batches so they can be re-invoiced
    if (invoice.attendanceBatchId) {
      await AttendanceBatch.updateMany(
        { invoiceId: invoice._id },
        { $set: { status: 'fully_approved', invoiceId: null, invoicedAt: null, invoicedBy: null } }
      );
    }

    return sendSuccess(res, null, 'Paid invoice soft-deleted successfully');
  }

  // Non-paid invoices: hard delete
  // If this invoice was generated from attendance batches, reset them so they can be re-invoiced
  if (invoice.attendanceBatchId) {
    await AttendanceBatch.updateMany(
      { invoiceId: invoice._id },
      { $set: { status: 'fully_approved', invoiceId: null, invoicedAt: null, invoicedBy: null } }
    );
  }

  await Invoice.findByIdAndDelete(req.params.id);

  sendSuccess(res, null, 'Invoice deleted successfully');
});

module.exports = router;
