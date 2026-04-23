const express = require('express');
const router = express.Router();
const { protect, requirePermission } = require('../../middleware/auth');
const { getModel } = require('../../config/modelRegistry');
const { sendSuccess, sendError, sendPaginated } = require('../../utils/responseHelper');
const { PAGINATION } = require('../../config/constants');
const validate = require('../../middleware/validate');
const driverVisaService = require('./driverVisa.service');
const auditLogger = require('../../utils/auditLogger');
const {
  createVisaValidation,
  updateBasicsValidation,
  updateFinancialsValidation,
  reasonValidation,
  lineItemValidation,
  processingValidation,
} = require('./driverVisa.validators');

router.use(protect);

/**
 * GET /api/driver-visas — list visa records with filters
 * Query: driverId, status, expiringInDays, unprocessed, page, limit
 */
router.get('/', requirePermission('driver_visas.view'), async (req, res) => {
  const page = parseInt(req.query.page) || PAGINATION.DEFAULT_PAGE;
  const limit = parseInt(req.query.limit) || PAGINATION.DEFAULT_LIMIT;
  const { items, total } = await driverVisaService.listVisaRecords(req, {
    driverId: req.query.driverId,
    status: req.query.status,
    expiringInDays: req.query.expiringInDays,
    unprocessed: req.query.unprocessed,
    page,
    limit,
  });
  sendPaginated(res, items, total, page, limit);
});

/**
 * GET /api/driver-visas/:id — get one record (full detail incl. line items)
 */
router.get('/:id', requirePermission('driver_visas.view'), async (req, res) => {
  const DriverVisa = getModel(req, 'DriverVisa');
  const visa = await DriverVisa.findById(req.params.id)
    .populate('driverId', 'fullName employeeCode visaType phoneUae clientUserId')
    .populate('createdBy', 'name')
    .populate('lastUpdatedBy', 'name')
    .populate('visaProcessedBy', 'name');
  if (!visa) return sendError(res, 'Visa record not found', 404);
  sendSuccess(res, visa.toObject({ virtuals: true }));
});

/**
 * POST /api/driver-visas — create record (Sales / Compliance)
 */
router.post(
  '/',
  requirePermission('driver_visas.create'),
  validate(createVisaValidation),
  async (req, res) => {
    const { driverId, ...payload } = req.body;
    const visa = await driverVisaService.createVisaRecord(
      req,
      driverId,
      payload,
      req.user._id
    );
    await auditLogger.logChange(
      'DriverVisa',
      visa._id,
      'create',
      null,
      `${visa.visaCategory} / totalCost ${visa.totalCost} / monthly ${visa.monthlyDeduction}`,
      req.user._id,
      'driver_visa_create'
    );
    sendSuccess(res, visa, 'Visa record created', 201);
  }
);

/**
 * PUT /api/driver-visas/:id — edit non-financial fields (Sales / Compliance)
 */
router.put(
  '/:id',
  requirePermission('driver_visas.edit'),
  validate(updateBasicsValidation),
  async (req, res) => {
    const visa = await driverVisaService.updateVisaBasics(
      req,
      req.params.id,
      req.body,
      req.user._id
    );
    await auditLogger.logChange(
      'DriverVisa',
      visa._id,
      'update_basics',
      null,
      JSON.stringify(req.body),
      req.user._id,
      'driver_visa_edit'
    );
    sendSuccess(res, visa, 'Visa record updated');
  }
);

/**
 * PUT /api/driver-visas/:id/financials — Admin/Finance/Accounts only
 */
router.put(
  '/:id/financials',
  requirePermission('driver_visas.manage'),
  validate(updateFinancialsValidation),
  async (req, res) => {
    const visa = await driverVisaService.updateVisaFinancials(
      req,
      req.params.id,
      req.body,
      req.user._id
    );
    await auditLogger.logChange(
      'DriverVisa',
      visa._id,
      'update_financials',
      null,
      `total=${visa.totalCost} medical=${visa.medicalInsuranceCost} discount=${visa.discountAmount} cash=${visa.cashPaid} monthly=${visa.monthlyDeduction}`,
      req.user._id,
      'driver_visa_manage'
    );
    sendSuccess(res, visa, 'Visa financials updated');
  }
);

/**
 * POST /api/driver-visas/:id/line-items — add statement line item
 */
router.post(
  '/:id/line-items',
  requirePermission('driver_visas.manage'),
  validate(lineItemValidation),
  async (req, res) => {
    const visa = await driverVisaService.addLineItem(
      req,
      req.params.id,
      req.body,
      req.user._id
    );
    await auditLogger.logChange(
      'DriverVisa',
      visa._id,
      'line_item_add',
      null,
      `${req.body.direction} ${req.body.amount} — ${req.body.label}`,
      req.user._id,
      'driver_visa_line_item'
    );
    sendSuccess(res, visa, 'Line item added');
  }
);

/**
 * DELETE /api/driver-visas/:id/line-items/:lineItemId — remove line item
 */
router.delete(
  '/:id/line-items/:lineItemId',
  requirePermission('driver_visas.manage'),
  async (req, res) => {
    const visa = await driverVisaService.removeLineItem(
      req,
      req.params.id,
      req.params.lineItemId,
      req.user._id
    );
    await auditLogger.logChange(
      'DriverVisa',
      visa._id,
      'line_item_remove',
      req.params.lineItemId,
      null,
      req.user._id,
      'driver_visa_line_item'
    );
    sendSuccess(res, visa, 'Line item removed');
  }
);

/**
 * PUT /api/driver-visas/:id/processing — Operations logs the processing date
 */
router.put(
  '/:id/processing',
  requirePermission('driver_visas.log_processing'),
  validate(processingValidation),
  async (req, res) => {
    const visa = await driverVisaService.logVisaProcessing(
      req,
      req.params.id,
      req.body.processedDate,
      req.user._id
    );
    await auditLogger.logChange(
      'DriverVisa',
      visa._id,
      'visa_processed',
      null,
      String(visa.visaProcessedDate),
      req.user._id,
      'driver_visa_processing'
    );
    sendSuccess(res, visa, 'Visa processing date logged');
  }
);

/**
 * PUT /api/driver-visas/:id/waive
 */
router.put(
  '/:id/waive',
  requirePermission('driver_visas.manage'),
  validate(reasonValidation),
  async (req, res) => {
    const visa = await driverVisaService.waiveVisa(
      req,
      req.params.id,
      req.body.reason,
      req.user._id
    );
    await auditLogger.logChange('DriverVisa', visa._id, 'waive', 'active', 'waived', req.user._id, 'driver_visa_waive');
    sendSuccess(res, visa, 'Visa record waived');
  }
);

/**
 * PUT /api/driver-visas/:id/cancel
 */
router.put(
  '/:id/cancel',
  requirePermission('driver_visas.manage'),
  validate(reasonValidation),
  async (req, res) => {
    const visa = await driverVisaService.cancelVisa(
      req,
      req.params.id,
      req.body.reason,
      req.user._id
    );
    await auditLogger.logChange('DriverVisa', visa._id, 'cancel', null, 'cancelled', req.user._id, 'driver_visa_cancel');
    sendSuccess(res, visa, 'Visa record cancelled');
  }
);

module.exports = router;
