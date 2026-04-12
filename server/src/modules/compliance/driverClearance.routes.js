const express = require('express');
const router = express.Router();
const { protect, requirePermission } = require('../../middleware/auth');
const clearanceService = require('./driverClearance.service');
const { sendSuccess, sendPaginated } = require('../../utils/responseHelper');
const { PAGINATION } = require('../../config/constants');
const auditLogger = require('../../utils/auditLogger');

router.use(protect);

// GET /api/driver-clearance — list with filters
router.get('/', requirePermission('clearance.view'), async (req, res) => {
  const page = parseInt(req.query.page) || PAGINATION.DEFAULT_PAGE;
  const limit = parseInt(req.query.limit) || PAGINATION.DEFAULT_LIMIT;

  const { items, total } = await clearanceService.listClearances(
    req,
    {
      overallStatus: req.query.status,
      driverId: req.query.driverId,
      clientId: req.query.clientId,
      projectId: req.query.projectId,
    },
    { page, limit }
  );

  sendPaginated(res, items, total, page, limit);
});

// GET /api/driver-clearance/:id — single record
router.get('/:id', requirePermission('clearance.view'), async (req, res) => {
  const doc = await clearanceService.getClearance(req, req.params.id);
  sendSuccess(res, doc);
});

// PUT /api/driver-clearance/:id/client — Operations logs client clearance
router.put('/:id/client', requirePermission('clearance.log_client'), async (req, res) => {
  const doc = await clearanceService.updateSection(req, req.params.id, 'clientClearance', req.body, req.user._id);
  await auditLogger.logChange('DriverClearance', req.params.id, 'clientClearance', null, req.body.status, req.user._id, 'clearance_client');
  sendSuccess(res, doc, 'Client clearance updated');
});

// PUT /api/driver-clearance/:id/supplier — Operations logs supplier clearance
router.put('/:id/supplier', requirePermission('clearance.log_supplier'), async (req, res) => {
  const doc = await clearanceService.updateSection(req, req.params.id, 'supplierClearance', req.body, req.user._id);
  await auditLogger.logChange('DriverClearance', req.params.id, 'supplierClearance', null, req.body.status, req.user._id, 'clearance_supplier');
  sendSuccess(res, doc, 'Supplier clearance updated');
});

// PUT /api/driver-clearance/:id/internal — Accounts logs internal clearance
router.put('/:id/internal', requirePermission('clearance.log_internal'), async (req, res) => {
  const doc = await clearanceService.updateSection(req, req.params.id, 'internalClearance', req.body, req.user._id);
  await auditLogger.logChange('DriverClearance', req.params.id, 'internalClearance', null, req.body.status, req.user._id, 'clearance_internal');
  sendSuccess(res, doc, 'Internal clearance updated');
});

// POST /api/driver-clearance/:id/supplier/deduction — add a supplier-side deduction
router.post('/:id/supplier/deduction', requirePermission('clearance.log_supplier'), async (req, res) => {
  const doc = await clearanceService.addSupplierDeduction(req, req.params.id, req.body, req.user._id);
  await auditLogger.logChange('DriverClearance', req.params.id, 'supplier_deduction_added', null, `${req.body.type}: ${req.body.amount}`, req.user._id, 'clearance_deduction');
  sendSuccess(res, doc, 'Supplier deduction added');
});

// DELETE /api/driver-clearance/:id/supplier/deduction/:deductionId — remove an unposted deduction
router.delete('/:id/supplier/deduction/:deductionId', requirePermission('clearance.log_supplier'), async (req, res) => {
  const doc = await clearanceService.removeSupplierDeduction(req, req.params.id, req.params.deductionId);
  await auditLogger.logChange('DriverClearance', req.params.id, 'supplier_deduction_removed', req.params.deductionId, null, req.user._id, 'clearance_deduction');
  sendSuccess(res, doc, 'Supplier deduction removed');
});

module.exports = router;
