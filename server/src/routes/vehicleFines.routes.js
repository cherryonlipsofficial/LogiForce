const express = require('express');
const router = express.Router();
const { protect, requirePermission } = require('../middleware/auth');
const { getModel } = require('../config/modelRegistry');
const {
  createFine,
  updateFine,
  deleteFine,
  getVehicleFines,
  getDriverFines,
  bulkCreateFines,
  disputeFine,
  waiveFine,
} = require('../services/vehicleFine.service');
const { sendSuccess, sendError, sendPaginated } = require('../utils/responseHelper');

router.use(protect);

// GET /api/vehicle-fines — List all fines (paginated, filterable)
router.get('/', async (req, res) => {
  try {
    const VehicleFine = getModel(req, 'VehicleFine');
    const { page = 1, limit = 20, vehicleId, driverId, fineType, status, dateFrom, dateTo } = req.query;

    const filter = {};
    if (vehicleId) filter.vehicleId = vehicleId;
    if (driverId) filter.driverId = driverId;
    if (fineType) filter.fineType = fineType;
    if (status) filter.status = status;
    if (dateFrom || dateTo) {
      filter.fineDate = {};
      if (dateFrom) filter.fineDate.$gte = new Date(dateFrom);
      if (dateTo) filter.fineDate.$lte = new Date(dateTo);
    }

    const skip = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);
    const [fines, total] = await Promise.all([
      VehicleFine.find(filter)
        .sort({ fineDate: -1 })
        .skip(skip)
        .limit(Math.min(100, parseInt(limit)))
        .populate('vehicleId', 'plate make model')
        .populate('driverId', 'fullName employeeCode')
        .populate('createdBy', 'name')
        .lean(),
      VehicleFine.countDocuments(filter),
    ]);

    sendPaginated(res, fines, total, parseInt(page), parseInt(limit));
  } catch (err) {
    sendError(res, err.message, 500);
  }
});

// GET /api/vehicle-fines/summary — Summary stats
router.get('/summary', async (req, res) => {
  try {
    const VehicleFine = getModel(req, 'VehicleFine');

    const [statusAgg, typeAgg] = await Promise.all([
      VehicleFine.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 }, totalAmount: { $sum: '$amount' } } },
      ]),
      VehicleFine.aggregate([
        { $group: { _id: '$fineType', count: { $sum: 1 }, totalAmount: { $sum: '$amount' } } },
      ]),
    ]);

    const byStatus = {};
    let totalPending = 0;
    let totalAmount = 0;
    for (const s of statusAgg) {
      byStatus[s._id] = { count: s.count, totalAmount: s.totalAmount };
      totalAmount += s.totalAmount;
      if (s._id === 'pending') totalPending = s.count;
    }

    const byType = {};
    for (const t of typeAgg) {
      byType[t._id] = { count: t.count, totalAmount: t.totalAmount };
    }

    sendSuccess(res, { totalPending, totalAmount, byStatus, byType });
  } catch (err) {
    sendError(res, err.message, 500);
  }
});

// GET /api/vehicle-fines/vehicle/:vehicleId — Fines for a specific vehicle
router.get('/vehicle/:vehicleId', async (req, res) => {
  try {
    const result = await getVehicleFines(req, req.params.vehicleId, req.query);
    sendPaginated(res, result.fines, result.total, result.page, result.limit);
  } catch (err) {
    sendError(res, err.message, err.statusCode || 500);
  }
});

// GET /api/vehicle-fines/driver/:driverId — Fines for a specific driver
router.get('/driver/:driverId', async (req, res) => {
  try {
    const result = await getDriverFines(req, req.params.driverId, req.query);
    sendPaginated(res, result.fines, result.total, result.page, result.limit);
  } catch (err) {
    sendError(res, err.message, err.statusCode || 500);
  }
});

// GET /api/vehicle-fines/:id — Get single fine
router.get('/:id', async (req, res) => {
  try {
    const VehicleFine = getModel(req, 'VehicleFine');
    const fine = await VehicleFine.findById(req.params.id)
      .populate('vehicleId', 'plate make model')
      .populate('driverId', 'fullName employeeCode')
      .populate('createdBy', 'name')
      .populate('waivedBy', 'name')
      .populate('disputeResolvedBy', 'name')
      .lean();

    if (!fine) return sendError(res, 'Fine not found', 404);
    sendSuccess(res, fine);
  } catch (err) {
    sendError(res, err.message, 500);
  }
});

// POST /api/vehicle-fines — Create fine
router.post('/', requirePermission('vehicles.manage_fines'), async (req, res) => {
  try {
    const fine = await createFine(req, req.body, req.user._id);
    sendSuccess(res, fine, 'Fine created', 201);
  } catch (err) {
    sendError(res, err.message, err.statusCode || 500);
  }
});

// POST /api/vehicle-fines/bulk — Bulk create fines
router.post('/bulk', requirePermission('vehicles.manage_fines'), async (req, res) => {
  try {
    const { fines } = req.body;
    if (!Array.isArray(fines) || fines.length === 0) {
      return sendError(res, 'fines array is required and must not be empty', 400);
    }
    if (fines.length > 500) {
      return sendError(res, 'Maximum 500 fines allowed per bulk upload', 400);
    }

    const result = await bulkCreateFines(req, fines, req.user._id);
    sendSuccess(
      res,
      result,
      `${result.created.length} fines created${result.errors.length > 0 ? `, ${result.errors.length} errors` : ''}`,
      201
    );
  } catch (err) {
    sendError(res, err.message, err.statusCode || 500);
  }
});

// PUT /api/vehicle-fines/:id — Update fine
router.put('/:id', requirePermission('vehicles.manage_fines'), async (req, res) => {
  try {
    const fine = await updateFine(req, req.params.id, req.body, req.user._id);
    sendSuccess(res, fine, 'Fine updated');
  } catch (err) {
    sendError(res, err.message, err.statusCode || 500);
  }
});

// PUT /api/vehicle-fines/:id/dispute — Dispute a fine
router.put('/:id/dispute', async (req, res) => {
  try {
    const { reason } = req.body;
    if (!reason) return sendError(res, 'Dispute reason is required', 400);

    const fine = await disputeFine(req, req.params.id, reason, req.user._id);
    sendSuccess(res, fine, 'Fine disputed');
  } catch (err) {
    sendError(res, err.message, err.statusCode || 500);
  }
});

// PUT /api/vehicle-fines/:id/waive — Waive a fine
router.put('/:id/waive', requirePermission('vehicles.manage_fines'), async (req, res) => {
  try {
    const { reason } = req.body;
    if (!reason) return sendError(res, 'Waiver reason is required', 400);

    const fine = await waiveFine(req, req.params.id, reason, req.user._id);
    sendSuccess(res, fine, 'Fine waived');
  } catch (err) {
    sendError(res, err.message, err.statusCode || 500);
  }
});

// DELETE /api/vehicle-fines/:id — Delete fine
router.delete('/:id', requirePermission('vehicles.manage_fines'), async (req, res) => {
  try {
    await deleteFine(req, req.params.id);
    sendSuccess(res, null, 'Fine deleted');
  } catch (err) {
    sendError(res, err.message, err.statusCode || 500);
  }
});

module.exports = router;
