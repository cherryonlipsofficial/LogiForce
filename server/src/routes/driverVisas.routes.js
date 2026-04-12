const express = require('express');
const router = express.Router();
const { protect, requirePermission } = require('../middleware/auth');
const { getModel } = require('../config/modelRegistry');
const { sendSuccess, sendError, sendPaginated } = require('../utils/responseHelper');
const { PAGINATION } = require('../config/constants');
const validate = require('../middleware/validate');
const driverVisaService = require('../services/driverVisa.service');
const auditLogger = require('../utils/auditLogger');
const {
  createVisaValidation,
  updateBasicsValidation,
  updateFinancialsValidation,
  reasonValidation,
} = require('../middleware/validators/driverVisa.validators');

router.use(protect);

/**
 * GET /api/driver-visas — list visa records with filters
 */
router.get('/', requirePermission('driver_visas.view'), async (req, res) => {
  const page = parseInt(req.query.page) || PAGINATION.DEFAULT_PAGE;
  const limit = parseInt(req.query.limit) || PAGINATION.DEFAULT_LIMIT;
  const { items, total } = await driverVisaService.listVisaRecords(req, {
    driverId: req.query.driverId,
    status: req.query.status,
    page,
    limit,
  });
  sendPaginated(res, items, total, page, limit);
});

/**
 * GET /api/driver-visas/:id — get one record
 */
router.get('/:id', requirePermission('driver_visas.view'), async (req, res) => {
  const DriverVisa = getModel(req, 'DriverVisa');
  const visa = await DriverVisa.findById(req.params.id)
    .populate('driverId', 'fullName employeeCode visaType')
    .populate('createdBy', 'name')
    .populate('lastUpdatedBy', 'name');
  if (!visa) return sendError(res, 'Visa record not found', 404);
  sendSuccess(res, visa);
});

/**
 * POST /api/driver-visas — create a new visa record (Sales / Compliance)
 *
 * Body may include financial fields; on create they are accepted because the
 * agreement is captured at the point of visa issuance. Edits afterwards are
 * restricted to the Finance/Accounts/Admin roles via driver_visas.manage.
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
 * PUT /api/driver-visas/:id/financials — edit totalCost / discount / cashPaid /
 * monthlyDeduction (Admin / Finance / Accounts only).
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
      `total=${visa.totalCost} discount=${visa.discountAmount} cash=${visa.cashPaid} monthly=${visa.monthlyDeduction}`,
      req.user._id,
      'driver_visa_manage'
    );
    sendSuccess(res, visa, 'Visa financials updated');
  }
);

/**
 * PUT /api/driver-visas/:id/waive — waive remaining balance
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
    await auditLogger.logChange(
      'DriverVisa',
      visa._id,
      'waive',
      'active',
      'waived',
      req.user._id,
      'driver_visa_waive'
    );
    sendSuccess(res, visa, 'Visa record waived');
  }
);

/**
 * PUT /api/driver-visas/:id/cancel — cancel visa record
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
    await auditLogger.logChange(
      'DriverVisa',
      visa._id,
      'cancel',
      null,
      'cancelled',
      req.user._id,
      'driver_visa_cancel'
    );
    sendSuccess(res, visa, 'Visa record cancelled');
  }
);

module.exports = router;
