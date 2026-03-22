const express = require('express');
const router = express.Router();
const { protect, restrictTo } = require('../middleware/auth');
const upload = require('../middleware/upload');
const driverService = require('../services/driver.service');
const { Driver, DriverDocument, SalaryRun } = require('../models');
const { sendSuccess, sendError, sendPaginated } = require('../utils/responseHelper');

// All routes are protected
router.use(protect);

// GET /api/drivers/expiring-documents — must be before /:id routes
router.get('/expiring-documents', async (req, res) => {
  const days = parseInt(req.query.days) || 30;
  const docs = await driverService.getExpiringDocuments(days);
  sendSuccess(res, docs);
});

// GET /api/drivers — list with pagination, search, filter
router.get('/', async (req, res) => {
  const { status, clientId, search, page, limit } = req.query;
  const result = await driverService.findAll(
    { status, clientId, search },
    { page, limit }
  );
  sendPaginated(res, result.drivers, result.total, result.page, result.limit);
});

// POST /api/drivers — create (ops, admin)
router.post('/', restrictTo('ops', 'admin'), async (req, res) => {
  const driver = await driverService.create(req.body, req.user._id);
  sendSuccess(res, driver, 'Driver created', 201);
});

// GET /api/drivers/:id — get single driver
router.get('/:id', async (req, res) => {
  const driver = await driverService.findById(req.params.id);
  sendSuccess(res, driver);
});

// PUT /api/drivers/:id — update (ops, admin)
router.put('/:id', restrictTo('ops', 'admin'), async (req, res) => {
  const driver = await driverService.update(req.params.id, req.body);
  sendSuccess(res, driver, 'Driver updated');
});

// DELETE /api/drivers/:id — soft delete (admin only)
router.delete('/:id', restrictTo('admin'), async (req, res) => {
  const driver = await driverService.softDelete(req.params.id);
  sendSuccess(res, driver, 'Driver set to resigned');
});

// GET /api/drivers/:id/ledger — paginated ledger
router.get('/:id/ledger', async (req, res) => {
  const { page, limit } = req.query;
  const result = await driverService.getLedger(req.params.id, { page, limit });
  sendPaginated(res, result.entries, result.total, result.page, result.limit);
});

// GET /api/drivers/:id/salary-runs — list salary runs for driver
router.get('/:id/salary-runs', async (req, res) => {
  const runs = await SalaryRun.find({ driverId: req.params.id })
    .sort({ createdAt: -1 })
    .populate('clientId', 'name');
  sendSuccess(res, runs);
});

// POST /api/drivers/:id/documents — upload document
router.post('/:id/documents', restrictTo('ops', 'admin'), upload.single('file'), async (req, res) => {
  const driver = await Driver.findById(req.params.id);
  if (!driver) return sendError(res, 'Driver not found', 404);

  if (!req.file) return sendError(res, 'No file uploaded', 400);

  const doc = await DriverDocument.create({
    driverId: req.params.id,
    docType: req.body.docType,
    fileKey: req.file.filename,
    expiryDate: req.body.expiryDate || null,
  });
  sendSuccess(res, doc, 'Document uploaded', 201);
});

// PUT /api/drivers/:id/status — change status with reason
router.put('/:id/status', restrictTo('ops', 'admin'), async (req, res) => {
  const { status, reason } = req.body;
  if (!status) return sendError(res, 'Status is required', 400);

  const driver = await Driver.findById(req.params.id);
  if (!driver) return sendError(res, 'Driver not found', 404);

  const previousStatus = driver.status;
  driver.status = status;
  await driver.save();

  // Create a ledger entry as a status log
  const { DriverLedger } = require('../models');
  await DriverLedger.create({
    driverId: driver._id,
    entryType: 'manual_debit',
    debit: 0,
    credit: 0,
    runningBalance: 0,
    description: `Status changed from ${previousStatus} to ${status}. Reason: ${reason || 'N/A'}`,
    createdBy: req.user._id,
  });

  sendSuccess(res, driver, 'Status updated');
});

module.exports = router;
