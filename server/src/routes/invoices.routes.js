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
  const query = { status: 'fully_approved', invoiceId: null };
  if (req.query.clientId) query.clientId = req.query.clientId;
  if (req.query.projectId) query.projectId = req.query.projectId;
  if (req.query.year) query['period.year'] = parseInt(req.query.year);
  if (req.query.month) query['period.month'] = parseInt(req.query.month);

  const batches = await AttendanceBatch.find(query)
    .populate('clientId', 'name')
    .populate('projectId', 'name projectCode')
    .select('batchId clientId projectId period totalRows matchedRows status createdAt')
    .sort({ createdAt: -1 })
    .limit(100);

  sendSuccess(res, batches);
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
router.get('/', async (req, res) => {
  const page = parseInt(req.query.page) || PAGINATION.DEFAULT_PAGE;
  const limit = parseInt(req.query.limit) || PAGINATION.DEFAULT_LIMIT;
  const skip = (page - 1) * limit;

  const query = {};
  if (req.query.clientId) query.clientId = req.query.clientId;
  if (req.query.status) query.status = req.query.status;
  if (req.query.year) query['period.year'] = parseInt(req.query.year);
  if (req.query.month) query['period.month'] = parseInt(req.query.month);

  const [invoices, total] = await Promise.all([
    Invoice.find(query)
      .populate('clientId', 'name')
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Invoice.countDocuments(query),
  ]);

  sendPaginated(res, invoices, total, page, limit);
});

// GET /api/invoices/:id — get invoice with line items
router.get('/:id', async (req, res) => {
  const invoice = await Invoice.findById(req.params.id)
    .populate('clientId')
    .populate('createdBy', 'name')
    .populate('lineItems.driverId', 'fullName employeeCode')
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
router.get('/:id/pdf', async (req, res) => {
  const invoice = await Invoice.findById(req.params.id)
    .populate('lineItems.driverId', 'fullName employeeCode')
    .populate('creditNotes.driverId', 'fullName employeeCode');

  if (!invoice) return sendError(res, 'Invoice not found', 404);

  const client = await Client.findById(invoice.clientId);
  if (!client) return sendError(res, 'Client not found', 404);

  const pdfBuffer = await generateInvoicePDF(invoice, client);

  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `inline; filename="${invoice.invoiceNo}.pdf"`,
    'Content-Length': pdfBuffer.length,
  });
  res.send(pdfBuffer);
});

module.exports = router;
