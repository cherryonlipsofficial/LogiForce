const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { Vehicle, Supplier, Driver } = require('../models');
const { sendSuccess, sendError, sendPaginated } = require('../utils/responseHelper');

router.use(protect);

// GET /api/vehicles — list with pagination, search, filters
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 50, search, status, supplierId, plate } = req.query;
    const filter = {};

    if (status) filter.status = status;
    if (supplierId) filter.supplierId = supplierId;
    if (plate) filter.plate = { $regex: plate, $options: 'i' };
    if (search) {
      filter.$or = [
        { plate: { $regex: search, $options: 'i' } },
        { make: { $regex: search, $options: 'i' } },
        { model: { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [vehicles, total] = await Promise.all([
      Vehicle.find(filter)
        .populate('supplierId', 'name serviceType')
        .populate('assignedDriverId', 'fullName employeeCode status')
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Vehicle.countDocuments(filter),
    ]);

    sendPaginated(res, vehicles, total, parseInt(page), parseInt(limit));
  } catch (err) {
    sendError(res, err.message, 500);
  }
});

// GET /api/vehicles/export — export vehicles as CSV
router.get('/export', async (req, res) => {
  try {
    const { status, supplierId, search } = req.query;
    const filter = {};

    if (status) filter.status = status;
    if (supplierId) filter.supplierId = supplierId;
    if (search) {
      filter.$or = [
        { plate: { $regex: search, $options: 'i' } },
        { make: { $regex: search, $options: 'i' } },
        { model: { $regex: search, $options: 'i' } },
      ];
    }

    const vehicles = await Vehicle.find(filter)
      .populate('supplierId', 'name')
      .populate('assignedDriverId', 'fullName employeeCode')
      .sort({ updatedAt: -1 })
      .lean();

    const formatDate = (d) => (d ? new Date(d).toLocaleDateString('en-GB') : '');
    const escapeCsv = (val) => {
      if (val == null) return '';
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const headers = [
      'Plate', 'Make', 'Model', 'Year', 'Color', 'Type', 'Status',
      'Supplier', 'Assigned Driver', 'Driver Code', 'Monthly Rate (AED)',
      'Contract Start', 'Contract End', 'Mulkiya Expiry', 'Insurance Expiry',
      'Own Vehicle', 'Notes',
    ];

    const rows = vehicles.map((v) => [
      v.plate,
      v.make,
      v.model,
      v.year,
      v.color,
      v.vehicleType,
      v.status,
      v.supplierId?.name,
      v.assignedDriverId?.fullName,
      v.assignedDriverId?.employeeCode,
      v.monthlyRate,
      formatDate(v.contractStart),
      formatDate(v.contractEnd),
      formatDate(v.mulkiyaExpiry),
      formatDate(v.insuranceExpiry),
      v.ownVehicle ? 'Yes' : 'No',
      v.notes,
    ]);

    const csv = [headers, ...rows].map((row) => row.map(escapeCsv).join(',')).join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=vehicles_export.csv');
    res.send(csv);
  } catch (err) {
    sendError(res, err.message, 500);
  }
});

// GET /api/vehicles/summary — fleet summary stats
router.get('/summary', async (req, res) => {
  try {
    const [statusCounts, supplierCounts] = await Promise.all([
      Vehicle.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      Vehicle.aggregate([
        { $group: { _id: '$supplierId', count: { $sum: 1 } } },
        { $lookup: { from: 'suppliers', localField: '_id', foreignField: '_id', as: 'supplier' } },
        { $unwind: { path: '$supplier', preserveNullAndEmptyArrays: true } },
        { $project: { name: { $ifNull: ['$supplier.name', 'Unassigned'] }, count: 1 } },
      ]),
    ]);

    const byStatus = {};
    for (const s of statusCounts) {
      byStatus[s._id] = s.count;
    }

    sendSuccess(res, {
      total: Object.values(byStatus).reduce((a, b) => a + b, 0),
      byStatus,
      bySupplier: supplierCounts.map((s) => ({ name: s.name, count: s.count })),
    });
  } catch (err) {
    sendError(res, err.message, 500);
  }
});

// GET /api/vehicles/:id — single vehicle
router.get('/:id', async (req, res) => {
  try {
    const vehicle = await Vehicle.findById(req.params.id)
      .populate('supplierId', 'name serviceType monthlyRate contactName')
      .populate('assignedDriverId', 'fullName employeeCode clientId status phoneUae');

    if (!vehicle) return sendError(res, 'Vehicle not found', 404);
    sendSuccess(res, vehicle);
  } catch (err) {
    sendError(res, err.message, 500);
  }
});

// POST /api/vehicles — create vehicle
router.post('/', async (req, res) => {
  try {
    const vehicle = await Vehicle.create(req.body);
    sendSuccess(res, vehicle, 'Vehicle created', 201);
  } catch (err) {
    if (err.code === 11000) {
      return sendError(res, 'A vehicle with this plate already exists', 409);
    }
    sendError(res, err.message, 500);
  }
});

// PUT /api/vehicles/:id — update vehicle
router.put('/:id', async (req, res) => {
  try {
    const vehicle = await Vehicle.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!vehicle) return sendError(res, 'Vehicle not found', 404);
    sendSuccess(res, vehicle, 'Vehicle updated');
  } catch (err) {
    if (err.code === 11000) {
      return sendError(res, 'A vehicle with this plate already exists', 409);
    }
    sendError(res, err.message, 500);
  }
});

// DELETE /api/vehicles/:id — remove vehicle
router.delete('/:id', async (req, res) => {
  try {
    const vehicle = await Vehicle.findByIdAndDelete(req.params.id);
    if (!vehicle) return sendError(res, 'Vehicle not found', 404);
    sendSuccess(res, null, 'Vehicle deleted');
  } catch (err) {
    sendError(res, err.message, 500);
  }
});

// PUT /api/vehicles/:id/assign — assign vehicle to driver
router.put('/:id/assign', async (req, res) => {
  try {
    const { driverId } = req.body;
    if (!driverId) return sendError(res, 'driverId is required', 400);

    const vehicle = await Vehicle.findByIdAndUpdate(
      req.params.id,
      { assignedDriverId: driverId, status: 'assigned' },
      { new: true }
    ).populate('assignedDriverId', 'fullName employeeCode');

    if (!vehicle) return sendError(res, 'Vehicle not found', 404);

    // Also update the driver's vehiclePlate
    await Driver.findByIdAndUpdate(driverId, { vehiclePlate: vehicle.plate });

    sendSuccess(res, vehicle, 'Vehicle assigned');
  } catch (err) {
    sendError(res, err.message, 500);
  }
});

// PUT /api/vehicles/:id/unassign — unassign vehicle from driver
router.put('/:id/unassign', async (req, res) => {
  try {
    const vehicle = await Vehicle.findById(req.params.id);
    if (!vehicle) return sendError(res, 'Vehicle not found', 404);

    if (vehicle.assignedDriverId) {
      await Driver.findByIdAndUpdate(vehicle.assignedDriverId, { vehiclePlate: null });
    }

    vehicle.assignedDriverId = null;
    vehicle.status = 'available';
    await vehicle.save();

    sendSuccess(res, vehicle, 'Vehicle unassigned');
  } catch (err) {
    sendError(res, err.message, 500);
  }
});

module.exports = router;
