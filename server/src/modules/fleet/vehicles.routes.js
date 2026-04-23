const express = require('express');
const router = express.Router();
const multer = require('multer');
const XLSX = require('xlsx');
const csvParser = require('csv-parser');
const { Readable } = require('stream');
const { protect, requirePermission } = require('../../middleware/auth');
const { getModel } = require('../../config/modelRegistry');
const {
  assignVehicle,
  returnVehicle,
  getVehicleHistory,
  getVehicleTimeline,
  getFleetDashboardStats,
} = require('./vehicleAssignment.service');
const { sendSuccess, sendError, sendPaginated } = require('../../utils/responseHelper');

const memUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.csv', '.xlsx', '.xls'];
    const ext = file.originalname.toLowerCase().slice(file.originalname.lastIndexOf('.'));
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('Only CSV and Excel files are allowed'));
  },
});

router.use(protect);

// GET /api/vehicles — list with pagination, search, filters
router.get('/', async (req, res) => {
  try {
    const Vehicle = getModel(req, 'Vehicle');
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
    const Vehicle = getModel(req, 'Vehicle');
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
    const Vehicle = getModel(req, 'Vehicle');
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

// GET /api/vehicles/fleet-dashboard — Fleet dashboard stats
router.get('/fleet-dashboard', requirePermission('vehicles.fleet_dashboard'), async (req, res) => {
  try {
    const stats = await getFleetDashboardStats(req);
    sendSuccess(res, stats);
  } catch (err) {
    sendError(res, err.message, err.statusCode || 500);
  }
});

// GET /api/vehicles/bulk-template — download CSV template for bulk upload
router.get('/bulk-template', (req, res) => {
  const headers = [
    'Plate', 'Make', 'Model', 'Year', 'Color', 'Vehicle Type', 'Status',
    'Supplier Name', 'Monthly Rate', 'Contract Start', 'Contract End',
    'Mulkiya Expiry', 'Insurance Expiry', 'Own Vehicle', 'Notes',
    'Off-Hire Reason', 'Off-Hire Date',
  ];
  const sampleRow = [
    'DXB A 12345', 'Toyota', 'Hiace', '2024', 'White', 'Van', 'available',
    'Belhasa', '1200', '2024-01-01', '2025-12-31',
    '2025-06-30', '2025-09-30', 'No', 'Sample vehicle',
    '', '',
  ];
  const escapeCsv = (val) => {
    if (val == null) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  const csv = [headers, sampleRow].map((row) => row.map(escapeCsv).join(',')).join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=vehicles_bulk_template.csv');
  res.send(csv);
});

// POST /api/vehicles/bulk-upload — bulk upload vehicles from CSV/XLSX
router.post('/bulk-upload', requirePermission('vehicles.create'), memUpload.single('file'), async (req, res) => {
  try {
    const Vehicle = getModel(req, 'Vehicle');
    const Supplier = getModel(req, 'Supplier');
    if (!req.file) return sendError(res, 'No file uploaded', 400);

    let rows = [];
    const ext = req.file.originalname.toLowerCase().slice(req.file.originalname.lastIndexOf('.'));

    if (ext === '.csv') {
      rows = await new Promise((resolve, reject) => {
        const results = [];
        const stream = Readable.from(req.file.buffer);
        stream
          .pipe(csvParser())
          .on('data', (row) => results.push(row))
          .on('end', () => resolve(results))
          .on('error', reject);
      });
    } else {
      const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) return sendError(res, 'Excel file has no sheets', 400);
      rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });
    }

    if (rows.length === 0) return sendError(res, 'File is empty', 400);
    if (rows.length > 500) return sendError(res, 'Maximum 500 rows allowed per upload', 400);

    // Normalize column headers to a consistent mapping
    const colMap = {
      plate: ['plate', 'plate number', 'platenumber', 'plate_number', 'license plate'],
      make: ['make', 'brand', 'manufacturer'],
      model: ['model'],
      year: ['year'],
      color: ['color', 'colour'],
      vehicleType: ['vehicle type', 'vehicletype', 'vehicle_type', 'type'],
      status: ['status'],
      supplierName: ['supplier name', 'suppliername', 'supplier_name', 'supplier'],
      monthlyRate: ['monthly rate', 'monthlyrate', 'monthly_rate', 'rate'],
      contractStart: ['contract start', 'contractstart', 'contract_start'],
      contractEnd: ['contract end', 'contractend', 'contract_end'],
      mulkiyaExpiry: ['mulkiya expiry', 'mulkiyaexpiry', 'mulkiya_expiry', 'mulkiya'],
      insuranceExpiry: ['insurance expiry', 'insuranceexpiry', 'insurance_expiry', 'insurance'],
      ownVehicle: ['own vehicle', 'ownvehicle', 'own_vehicle', 'own'],
      notes: ['notes', 'note', 'remarks'],
      offHireReason: ['off-hire reason', 'offhirereason', 'off_hire_reason', 'offhire reason'],
      offHireDate: ['off-hire date', 'offhiredate', 'off_hire_date', 'offhire date'],
    };

    const resolveKey = (row) => {
      const keys = Object.keys(row);
      const resolved = {};
      for (const [field, aliases] of Object.entries(colMap)) {
        for (const alias of aliases) {
          const found = keys.find((k) => k.toLowerCase().trim() === alias);
          if (found) {
            resolved[field] = row[found];
            break;
          }
        }
      }
      return resolved;
    };

    // Preload suppliers for name-matching
    const suppliers = await Supplier.find({}).lean();
    const supplierMap = {};
    for (const s of suppliers) {
      supplierMap[s.name.toLowerCase().trim()] = s._id;
    }

    const validTypes = ['Sedan', 'SUV', 'Van', 'Pickup', 'Motorcycle', 'Truck', 'Other'];
    const validStatuses = ['available', 'assigned', 'maintenance', 'off_hired', 'reserved'];

    const parseDate = (val) => {
      if (!val) return undefined;
      const str = String(val).trim();
      if (!str) return undefined;
      // Handle Excel serial date numbers
      if (!isNaN(str) && Number(str) > 10000) {
        const excelDate = new Date((Number(str) - 25569) * 86400 * 1000);
        return isNaN(excelDate.getTime()) ? undefined : excelDate;
      }
      const d = new Date(str);
      return isNaN(d.getTime()) ? undefined : d;
    };

    const results = [];
    const existingPlates = new Set(
      (await Vehicle.find({}, 'plate').lean()).map((v) => v.plate.toLowerCase().trim())
    );
    const seenPlates = new Set();

    for (let i = 0; i < rows.length; i++) {
      const raw = resolveKey(rows[i]);
      const rowNum = i + 2; // 1-indexed + header row
      const errors = [];

      const plate = String(raw.plate || '').trim();
      if (!plate) {
        errors.push('Plate number is required');
      } else {
        if (existingPlates.has(plate.toLowerCase())) {
          errors.push(`Plate "${plate}" already exists in the system`);
        }
        if (seenPlates.has(plate.toLowerCase())) {
          errors.push(`Duplicate plate "${plate}" in file`);
        }
        seenPlates.add(plate.toLowerCase());
      }

      const vehicleType = String(raw.vehicleType || '').trim();
      const matchedType = validTypes.find((t) => t.toLowerCase() === vehicleType.toLowerCase()) || '';
      if (vehicleType && !matchedType) {
        errors.push(`Invalid vehicle type "${vehicleType}". Must be one of: ${validTypes.join(', ')}`);
      }

      const status = String(raw.status || '').trim().toLowerCase();
      if (status && !validStatuses.includes(status)) {
        errors.push(`Invalid status "${raw.status}". Must be one of: ${validStatuses.join(', ')}`);
      }

      const supplierName = String(raw.supplierName || '').trim();
      let supplierId = undefined;
      if (supplierName) {
        supplierId = supplierMap[supplierName.toLowerCase()];
        if (!supplierId) {
          errors.push(`Supplier "${supplierName}" not found`);
        }
      }

      const year = raw.year ? Number(raw.year) : undefined;
      if (raw.year && (isNaN(year) || year < 1900 || year > 2100)) {
        errors.push(`Invalid year "${raw.year}"`);
      }

      const monthlyRate = raw.monthlyRate ? Number(raw.monthlyRate) : 0;
      if (raw.monthlyRate && isNaN(monthlyRate)) {
        errors.push(`Invalid monthly rate "${raw.monthlyRate}"`);
      }

      const ownStr = String(raw.ownVehicle || '').trim().toLowerCase();
      const ownVehicle = ['yes', 'true', '1'].includes(ownStr);

      const vehicle = {
        plate,
        make: String(raw.make || '').trim() || undefined,
        model: String(raw.model || '').trim() || undefined,
        year: year || undefined,
        color: String(raw.color || '').trim() || undefined,
        vehicleType: matchedType || 'Sedan',
        status: status || 'available',
        supplierId,
        monthlyRate,
        contractStart: parseDate(raw.contractStart),
        contractEnd: parseDate(raw.contractEnd),
        mulkiyaExpiry: parseDate(raw.mulkiyaExpiry),
        insuranceExpiry: parseDate(raw.insuranceExpiry),
        ownVehicle,
        notes: String(raw.notes || '').trim() || undefined,
        offHireReason: String(raw.offHireReason || '').trim() || undefined,
        offHireDate: parseDate(raw.offHireDate),
      };

      results.push({ row: rowNum, data: vehicle, errors, supplierName });
    }

    const validRows = results.filter((r) => r.errors.length === 0);
    const errorRows = results.filter((r) => r.errors.length > 0);

    // If dryRun query param is set, return preview only
    if (req.query.preview === 'true') {
      return sendSuccess(res, {
        total: results.length,
        valid: validRows.length,
        errors: errorRows.length,
        preview: results.map((r) => ({
          row: r.row,
          plate: r.data.plate,
          make: r.data.make,
          model: r.data.model,
          vehicleType: r.data.vehicleType,
          status: r.data.status,
          supplierName: r.supplierName,
          errors: r.errors,
        })),
      });
    }

    if (validRows.length === 0) {
      return sendError(res, 'No valid rows to import. Check the errors.', 400);
    }

    // Insert valid vehicles
    const inserted = await Vehicle.insertMany(
      validRows.map((r) => r.data),
      { ordered: false }
    );

    sendSuccess(
      res,
      {
        imported: inserted.length,
        errors: errorRows.length,
        errorDetails: errorRows.map((r) => ({
          row: r.row,
          plate: r.data.plate,
          errors: r.errors,
        })),
      },
      `${inserted.length} vehicles imported successfully`,
      201
    );
  } catch (err) {
    if (err.message === 'Only CSV and Excel files are allowed') {
      return sendError(res, err.message, 400);
    }
    sendError(res, err.message, 500);
  }
});

// POST /api/vehicles/assignments/:assignmentId/return — return a vehicle
router.post('/assignments/:assignmentId/return', requirePermission('vehicles.assign'), async (req, res) => {
  try {
    const { returnCondition, damageNotes, damagePenaltyAmount } = req.body;

    if (returnCondition && returnCondition !== 'good' && !damageNotes) {
      return sendError(res, 'Damage notes are required when condition is not good', 400);
    }

    const assignment = await returnVehicle(
      req,
      req.params.assignmentId,
      {
        returnCondition: returnCondition,
        damageNotes: damageNotes,
        damagePenaltyAmount: damagePenaltyAmount || 0,
      },
      req.user._id
    );
    sendSuccess(res, assignment, 'Vehicle returned successfully');
  } catch (err) {
    sendError(res, err.message, err.statusCode || 500);
  }
});

// GET /api/vehicles/:id — single vehicle
router.get('/:id', async (req, res) => {
  try {
    const Vehicle = getModel(req, 'Vehicle');
    const vehicle = await Vehicle.findById(req.params.id)
      .populate('supplierId', 'name serviceType monthlyRate contactName')
      .populate('assignedDriverId', 'fullName employeeCode clientId status phoneUae')
      .lean();

    if (!vehicle) return sendError(res, 'Vehicle not found', 404);
    sendSuccess(res, vehicle);
  } catch (err) {
    sendError(res, err.message, 500);
  }
});

// POST /api/vehicles — create vehicle
router.post('/', requirePermission('vehicles.create'), async (req, res) => {
  try {
    const Vehicle = getModel(req, 'Vehicle');
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
router.put('/:id', requirePermission('vehicles.edit'), async (req, res) => {
  try {
    const Vehicle = getModel(req, 'Vehicle');
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
router.delete('/:id', requirePermission('vehicles.off_hire'), async (req, res) => {
  try {
    const Vehicle = getModel(req, 'Vehicle');
    const vehicle = await Vehicle.findByIdAndDelete(req.params.id);
    if (!vehicle) return sendError(res, 'Vehicle not found', 404);
    sendSuccess(res, null, 'Vehicle deleted');
  } catch (err) {
    sendError(res, err.message, 500);
  }
});

// PUT /api/vehicles/:id/assign — assign vehicle to driver
router.put('/:id/assign', requirePermission('vehicles.assign'), async (req, res) => {
  try {
    const Vehicle = getModel(req, 'Vehicle');
    const Driver = getModel(req, 'Driver');
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
router.put('/:id/unassign', requirePermission('vehicles.assign'), async (req, res) => {
  try {
    const Vehicle = getModel(req, 'Vehicle');
    const Driver = getModel(req, 'Driver');
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

// POST /api/vehicles/:id/assign — assign vehicle to driver (with full tracking)
router.post('/:id/assign', requirePermission('vehicles.assign'), async (req, res) => {
  try {
    const { driverId, expectedReturnDate, monthlyDeductionAmount, notes } = req.body;

    if (!driverId) {
      return sendError(res, 'driverId is required', 400);
    }
    if (!/^[0-9a-fA-F]{24}$/.test(driverId)) {
      return sendError(res, 'driverId must be a valid ObjectId', 400);
    }
    if (expectedReturnDate && new Date(expectedReturnDate) <= new Date()) {
      return sendError(res, 'expectedReturnDate must be a future date', 400);
    }

    const assignment = await assignVehicle(
      req,
      req.params.id,
      driverId,
      {
        expectedReturnDate: expectedReturnDate,
        monthlyDeductionAmount: monthlyDeductionAmount,
        notes: notes,
      },
      req.user._id
    );

    res.status(201).json({
      success: true,
      message: 'Vehicle assigned successfully',
      data: assignment,
    });
  } catch (err) {
    sendError(res, err.message, err.statusCode || 500);
  }
});

// GET /api/vehicles/:id/assignment-history — vehicle assignment history
router.get('/:id/assignment-history', requirePermission('vehicles.view'), async (req, res) => {
  try {
    const result = await getVehicleHistory(
      req,
      req.params.id,
      parseInt(req.query.page) || 1,
      parseInt(req.query.limit) || 20
    );
    sendSuccess(res, result);
  } catch (err) {
    sendError(res, err.message, err.statusCode || 500);
  }
});

// GET /api/vehicles/:id/current-assignment — active assignment for a vehicle
router.get('/:id/current-assignment', requirePermission('vehicles.view'), async (req, res) => {
  try {
    const VehicleAssignment = getModel(req, 'VehicleAssignment');
    const assignment = await VehicleAssignment.findOne({
      vehicleId: req.params.id,
      status: 'active',
    })
      .populate('driverId', 'fullName employeeCode phoneUae status')
      .populate('assignedBy', 'name')
      .lean();

    sendSuccess(res, assignment || null);
  } catch (err) {
    sendError(res, err.message, err.statusCode || 500);
  }
});

// GET /api/vehicles/:id/timeline — Full vehicle assignment timeline with idle periods
router.get('/:id/timeline', requirePermission('vehicles.view_timeline'), async (req, res) => {
  try {
    const timeline = await getVehicleTimeline(req, req.params.id);
    sendSuccess(res, timeline);
  } catch (err) {
    sendError(res, err.message, err.statusCode || 500);
  }
});

// POST /api/vehicles/:id/off-hire — Off-hire a vehicle (calculate penalty if early termination)
router.post('/:id/off-hire', requirePermission('vehicles.off_hire'), async (req, res) => {
  try {
    const Vehicle = getModel(req, 'Vehicle');
    const vehicle = await Vehicle.findById(req.params.id);
    if (!vehicle) return sendError(res, 'Vehicle not found', 404);

    if (vehicle.status === 'off_hired') {
      return sendError(res, 'Vehicle is already off-hired', 400);
    }

    const offHireDate = new Date(req.body.offHireDate || Date.now());
    let penaltyAmount = 0;

    // If vehicle is currently assigned, auto-return it first
    if (vehicle.status === 'assigned' && vehicle.currentAssignmentId) {
      await returnVehicle(req, vehicle.currentAssignmentId, {
        returnCondition: req.body.returnCondition || 'good',
        damageNotes: req.body.damageNotes || 'Auto-returned due to off-hire',
      }, req.user._id);
    }

    // Calculate early termination penalty
    if (vehicle.contractEnd && offHireDate < new Date(vehicle.contractEnd)) {
      if (
        vehicle.contractStart &&
        vehicle.minimumContractMonths > 0
      ) {
        const contractStartDate = new Date(vehicle.contractStart);
        const monthsElapsed =
          (offHireDate.getFullYear() - contractStartDate.getFullYear()) * 12 +
          (offHireDate.getMonth() - contractStartDate.getMonth());

        if (monthsElapsed < vehicle.minimumContractMonths && vehicle.earlyTerminationPenalty > 0) {
          penaltyAmount = vehicle.earlyTerminationPenalty;
        } else if (vehicle.penaltyPerDay > 0) {
          const remainingDays = Math.ceil(
            (new Date(vehicle.contractEnd) - offHireDate) / (24 * 60 * 60 * 1000)
          );
          penaltyAmount = remainingDays * vehicle.penaltyPerDay;
        }
      } else if (vehicle.penaltyPerDay > 0) {
        const remainingDays = Math.ceil(
          (new Date(vehicle.contractEnd) - offHireDate) / (24 * 60 * 60 * 1000)
        );
        penaltyAmount = remainingDays * vehicle.penaltyPerDay;
      }
    }

    // Reload vehicle after possible return
    const updatedVehicle = await Vehicle.findById(req.params.id);
    updatedVehicle.status = 'off_hired';
    updatedVehicle.offHireDate = offHireDate;
    updatedVehicle.offHireReason = req.body.reason || null;
    updatedVehicle.offHirePenaltyAmount = penaltyAmount;
    updatedVehicle.offHireBy = req.user._id;
    updatedVehicle.currentDriverId = null;
    updatedVehicle.currentAssignmentId = null;
    await updatedVehicle.save();

    sendSuccess(res, {
      vehicle: updatedVehicle,
      penaltyAmount,
      earlyTermination: penaltyAmount > 0,
    }, 'Vehicle off-hired successfully');
  } catch (err) {
    sendError(res, err.message, err.statusCode || 500);
  }
});

// PUT /api/vehicles/:id/mileage — Update mileage
router.put('/:id/mileage', requirePermission('vehicles.edit'), async (req, res) => {
  try {
    const Vehicle = getModel(req, 'Vehicle');
    const { currentMileage, mileageUnit } = req.body;

    if (currentMileage === undefined || currentMileage === null) {
      return sendError(res, 'currentMileage is required', 400);
    }
    if (currentMileage < 0) {
      return sendError(res, 'currentMileage must be non-negative', 400);
    }

    const update = { currentMileage };
    if (mileageUnit) update.mileageUnit = mileageUnit;

    const vehicle = await Vehicle.findByIdAndUpdate(req.params.id, update, {
      new: true,
      runValidators: true,
    });
    if (!vehicle) return sendError(res, 'Vehicle not found', 404);

    sendSuccess(res, vehicle, 'Mileage updated');
  } catch (err) {
    sendError(res, err.message, 500);
  }
});

module.exports = router;
