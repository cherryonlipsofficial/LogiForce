const express = require('express');
const router = express.Router();
const { protect, requirePermission } = require('../../middleware/auth');
const creditNoteService = require('./creditNote.service');
const { getModel } = require('../../config/modelRegistry');
const { sendSuccess, sendError, sendPaginated } = require('../../utils/responseHelper');
const { PAGINATION } = require('../../config/constants');
const { generateCreditNotePDF } = require('../../utils/pdfGenerator');
const validate = require('../../middleware/validate');
const {
  createCreditNoteValidation,
  adjustCreditNoteValidation,
  resolveLineValidation,
} = require('./creditNote.validators');
const auditLogger = require('../../utils/auditLogger');

// All routes are protected
router.use(protect);

// GET /api/credit-notes/settlement-summary — dashboard KPIs
router.get('/settlement-summary', requirePermission('credit_notes.view'), async (req, res) => {
  const CreditNote = getModel(req, 'CreditNote');
  const baseQuery = { isDeleted: { $ne: true } };

  const unadjustedQuery = { ...baseQuery, status: { $in: ['draft', 'sent'] } };

  const [total, settled, pending, totalAmountAgg] = await Promise.all([
    CreditNote.countDocuments(baseQuery),
    CreditNote.countDocuments({ ...baseQuery, status: 'settled' }),
    CreditNote.countDocuments({ ...baseQuery, status: { $nin: ['settled', 'cancelled'] } }),
    CreditNote.aggregate([
      { $match: unadjustedQuery },
      { $group: { _id: null, totalAmount: { $sum: '$totalAmount' } } },
    ]),
  ]);

  sendSuccess(res, {
    total,
    settled,
    pending,
    totalAmount: totalAmountAgg[0]?.totalAmount || 0,
  });
});

// POST /api/credit-notes — create credit note
router.post('/', requirePermission('credit_notes.create'), validate(createCreditNoteValidation), async (req, res) => {
  const creditNote = await creditNoteService.createCreditNote(req.body, req.user._id);
  await auditLogger.logChange('CreditNote', creditNote._id, 'create', null, 'draft', req.user._id, 'credit_note_created');
  sendSuccess(res, creditNote, 'Credit note created successfully', 201);
});

// GET /api/credit-notes — list with filters
router.get('/', requirePermission('credit_notes.view'), async (req, res) => {
  const CreditNote = getModel(req, 'CreditNote');
  const page = parseInt(req.query.page) || PAGINATION.DEFAULT_PAGE;
  const limit = parseInt(req.query.limit) || PAGINATION.DEFAULT_LIMIT;
  const skip = (page - 1) * limit;

  const query = { isDeleted: { $ne: true } };
  if (req.query.clientId) query.clientId = req.query.clientId;
  if (req.query.projectId) query.projectId = req.query.projectId;
  if (req.query.status) query.status = req.query.status;
  if (req.query.year) query['period.year'] = parseInt(req.query.year);
  if (req.query.month) query['period.month'] = parseInt(req.query.month);

  const [creditNotes, total] = await Promise.all([
    CreditNote.find(query)
      .populate('clientId', 'name')
      .populate('projectId', 'name projectCode')
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    CreditNote.countDocuments(query),
  ]);

  sendPaginated(res, creditNotes, total, page, limit);
});

// GET /api/credit-notes/:id — get single with populated fields
router.get('/:id', requirePermission('credit_notes.view'), async (req, res) => {
  const CreditNote = getModel(req, 'CreditNote');
  const cn = await CreditNote.findOne({ _id: req.params.id, isDeleted: { $ne: true } })
    .populate('clientId', 'name')
    .populate('projectId', 'name projectCode')
    .populate('lineItems.driverId', 'fullName employeeCode clientUserId status')
    .populate('linkedInvoiceId', 'invoiceNo total')
    .populate('createdBy', 'name')
    .populate('sentBy', 'name')
    .lean();

  if (!cn) return sendError(res, 'Credit note not found', 404);
  sendSuccess(res, cn);
});

// PUT /api/credit-notes/:id/send — mark as sent to client
router.put('/:id/send', requirePermission('credit_notes.send'), async (req, res) => {
  const { creditNote, adjustmentSummary } = await creditNoteService.sendCreditNote(req.params.id, req.user._id);
  await auditLogger.logChange('CreditNote', req.params.id, 'status', 'draft', 'sent', req.user._id, 'credit_note_sent');
  sendSuccess(res, { creditNote, adjustmentSummary }, 'Credit note sent to client');
});

// PUT /api/credit-notes/:id/retrigger-adjustment — re-trigger salary adjustment for already-sent CN
router.put('/:id/retrigger-adjustment', requirePermission('credit_notes.settle'), async (req, res) => {
  const { creditNote, adjustmentSummary } = await creditNoteService.retriggerSalaryAdjustment(req.params.id, req.user._id);
  await auditLogger.logChange('CreditNote', req.params.id, 'retrigger_adjustment', null, JSON.stringify(adjustmentSummary), req.user._id, 'credit_note_retrigger');
  sendSuccess(res, { creditNote, adjustmentSummary }, 'Salary adjustment re-triggered');
});

// PUT /api/credit-notes/:id/adjust — link to invoice
router.put('/:id/adjust', requirePermission('credit_notes.adjust'), validate(adjustCreditNoteValidation), async (req, res) => {
  const cn = await creditNoteService.adjustCreditNote(req.params.id, req.body.invoiceId, req.user._id);
  await auditLogger.logChange('CreditNote', req.params.id, 'status', 'sent', 'adjusted', req.user._id, 'credit_note_adjusted');
  sendSuccess(res, cn, 'Credit note linked to invoice');
});

// PUT /api/credit-notes/:id/lines/:lineId/resolve — manually resolve a line
router.put('/:id/lines/:lineId/resolve', requirePermission('credit_notes.settle'), validate(resolveLineValidation), async (req, res) => {
  const cn = await creditNoteService.manuallyResolveLine(
    req.params.id,
    req.params.lineId,
    req.body.note,
    req.user._id
  );
  await auditLogger.logChange('CreditNote', req.params.id, 'line_resolved', null, req.params.lineId, req.user._id, 'credit_note_line_resolved');
  sendSuccess(res, cn, 'Line item resolved');
});

// DELETE /api/credit-notes/:id — delete (draft only)
router.delete('/:id', requirePermission('credit_notes.delete'), async (req, res) => {
  const CreditNote = getModel(req, 'CreditNote');
  const cn = await CreditNote.findOne({ _id: req.params.id, isDeleted: { $ne: true } });
  if (!cn) return sendError(res, 'Credit note not found', 404);

  if (cn.status !== 'draft') {
    return sendError(res, 'Only draft credit notes can be deleted', 400);
  }

  cn.isDeleted = true;
  cn.deletedAt = new Date();
  cn.deletedBy = req.user._id;
  cn.deleteRemark = req.body.remark || '';
  await cn.save();

  await auditLogger.logChange('CreditNote', req.params.id, 'delete', cn.status, null, req.user._id, 'credit_note_deleted');
  sendSuccess(res, null, 'Credit note deleted');
});

// GET /api/credit-notes/:id/pdf — generate PDF
router.get('/:id/pdf', requirePermission('credit_notes.download'), async (req, res) => {
  const CreditNote = getModel(req, 'CreditNote');
  const CompanySettings = getModel(req, 'CompanySettings');
  const cn = await CreditNote.findById(req.params.id)
    .populate('clientId')
    .populate('projectId', 'name projectCode')
    .lean();

  if (!cn) return sendError(res, 'Credit note not found', 404);

  const client = cn.clientId;
  const project = cn.projectId;

  const companySettings = await CompanySettings.getSettings();

  const pdfBuffer = await generateCreditNotePDF(cn, client, project, companySettings);

  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `inline; filename="${cn.creditNoteNo}.pdf"`,
    'Content-Length': pdfBuffer.length,
  });
  res.send(pdfBuffer);
});

module.exports = router;
