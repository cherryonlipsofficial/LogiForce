const express = require('express');
const router = express.Router();
const { protect, requirePermission } = require('../middleware/auth');
const driverReceivableService = require('../services/driverReceivable.service');
const { getModel } = require('../config/modelRegistry');
const { sendSuccess, sendError, sendPaginated } = require('../utils/responseHelper');
const { PAGINATION } = require('../config/constants');
const validate = require('../middleware/validate');
const {
  recordRecoveryValidation,
  writeOffValidation,
} = require('../middleware/validators/driverReceivable.validators');
const auditLogger = require('../utils/auditLogger');

// All routes are protected
router.use(protect);

// GET /api/receivables/summary — dashboard KPIs
router.get('/summary', requirePermission('receivables.view'), async (req, res) => {
  const summary = await driverReceivableService.getSummary();
  sendSuccess(res, summary);
});

// GET /api/receivables — list with filters
router.get('/', requirePermission('receivables.view'), async (req, res) => {
  const DriverReceivable = getModel(req, 'DriverReceivable');
  const page = parseInt(req.query.page) || PAGINATION.DEFAULT_PAGE;
  const limit = parseInt(req.query.limit) || PAGINATION.DEFAULT_LIMIT;
  const skip = (page - 1) * limit;

  const query = { isDeleted: { $ne: true } };
  if (req.query.driverId) query.driverId = req.query.driverId;
  if (req.query.clientId) query.clientId = req.query.clientId;
  if (req.query.projectId) query.projectId = req.query.projectId;
  if (req.query.status) query.status = req.query.status;
  if (req.query.reason) query.reason = req.query.reason;

  const [receivables, total] = await Promise.all([
    DriverReceivable.find(query)
      .populate('driverId', 'fullName employeeCode status')
      .populate('creditNoteId', 'creditNoteNo totalAmount')
      .populate('clientId', 'name')
      .populate('projectId', 'name projectCode')
      .populate('createdBy', 'name')
      .populate('writeOffApprovedBy', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    DriverReceivable.countDocuments(query),
  ]);

  sendPaginated(res, receivables, total, page, limit);
});

// GET /api/receivables/:id — get single receivable
router.get('/:id', requirePermission('receivables.view'), async (req, res) => {
  const DriverReceivable = getModel(req, 'DriverReceivable');
  const receivable = await DriverReceivable.findOne({ _id: req.params.id, isDeleted: { $ne: true } })
    .populate('driverId', 'fullName employeeCode status phoneUae')
    .populate('creditNoteId', 'creditNoteNo totalAmount period description')
    .populate('clientId', 'name')
    .populate('projectId', 'name projectCode')
    .populate('createdBy', 'name')
    .populate('recoveries.recoveredBy', 'name')
    .populate('writeOffApprovedBy', 'name')
    .lean();

  if (!receivable) return sendError(res, 'Driver receivable not found', 404);
  sendSuccess(res, receivable);
});

// PUT /api/receivables/:id/recover — record a recovery
router.put('/:id/recover', requirePermission('receivables.recover'), validate(recordRecoveryValidation), async (req, res) => {
  const { method, amount, reference, note } = req.body;
  const receivable = await driverReceivableService.recordRecovery(
    req.params.id,
    { method, amount, reference, note },
    req.user._id
  );

  await auditLogger.logChange('DriverReceivable', req.params.id, 'recovery', null, `${method}: ${amount} AED`, req.user._id, 'receivable_recovery');
  sendSuccess(res, receivable, 'Recovery recorded successfully');
});

// PUT /api/receivables/:id/write-off — write off remaining balance
router.put('/:id/write-off', requirePermission('receivables.write_off'), validate(writeOffValidation), async (req, res) => {
  const { reason } = req.body;
  const receivable = await driverReceivableService.writeOff(
    req.params.id,
    { reason },
    req.user._id
  );

  await auditLogger.logChange('DriverReceivable', req.params.id, 'write_off', null, reason, req.user._id, 'receivable_write_off');
  sendSuccess(res, receivable, 'Receivable written off');
});

module.exports = router;
