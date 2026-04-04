const { getModel } = require('../config/modelRegistry');

/**
 * Resolve which driver had a vehicle at a given date by querying VehicleAssignment.
 */
async function resolveDriverForFine(req, vehicleId, fineDate) {
  const VehicleAssignment = getModel(req, 'VehicleAssignment');
  const date = new Date(fineDate);

  const assignment = await VehicleAssignment.findOne({
    vehicleId,
    assignedDate: { $lte: date },
    $or: [
      { returnedDate: { $gte: date } },
      { returnedDate: null, status: 'active' },
    ],
  })
    .populate('driverId', 'fullName employeeCode')
    .lean();

  if (!assignment || !assignment.driverId) return null;

  return {
    driverId: assignment.driverId._id,
    assignmentId: assignment._id,
    driverName: assignment.driverId.fullName || assignment.driverName,
    driverEmployeeCode: assignment.driverId.employeeCode || assignment.driverEmployeeCode,
  };
}

/**
 * Create a vehicle fine with auto-resolved driver and denormalized fields.
 */
async function createFine(req, data, userId) {
  const VehicleFine = getModel(req, 'VehicleFine');
  const Vehicle = getModel(req, 'Vehicle');

  const vehicle = await Vehicle.findById(data.vehicleId);
  if (!vehicle) {
    const err = new Error('Vehicle not found');
    err.statusCode = 404;
    throw err;
  }

  // Auto-resolve driver
  const resolved = await resolveDriverForFine(req, data.vehicleId, data.fineDate);

  // Compute deduction period from fineDate
  const fineDate = new Date(data.fineDate);
  const deductionPeriod = {
    year: fineDate.getFullYear(),
    month: fineDate.getMonth() + 1,
  };

  const fine = await VehicleFine.create({
    vehicleId: data.vehicleId,
    driverId: resolved ? resolved.driverId : null,
    vehicleAssignmentId: resolved ? resolved.assignmentId : null,
    fineType: data.fineType,
    amount: data.amount,
    fineDate: data.fineDate,
    description: data.description || null,
    referenceNumber: data.referenceNumber || null,
    status: resolved ? 'pending' : 'unassigned',
    deductionPeriod,
    vehiclePlate: vehicle.plate,
    driverName: resolved ? resolved.driverName : null,
    driverEmployeeCode: resolved ? resolved.driverEmployeeCode : null,
    createdBy: userId,
    notes: data.notes || null,
  });

  // Update vehicle fine counters
  await Vehicle.findByIdAndUpdate(data.vehicleId, {
    $inc: { totalFinesAmount: data.amount, totalFinesCount: 1 },
  });

  return fine;
}

/**
 * Update a fine. If fineDate changes, re-resolve the driver.
 */
async function updateFine(req, fineId, data, userId) {
  const VehicleFine = getModel(req, 'VehicleFine');

  const fine = await VehicleFine.findById(fineId);
  if (!fine) {
    const err = new Error('Fine not found');
    err.statusCode = 404;
    throw err;
  }

  if (fine.status === 'deducted') {
    const err = new Error('Cannot update a fine that has already been deducted from salary');
    err.statusCode = 400;
    throw err;
  }

  const fineDateChanged = data.fineDate && new Date(data.fineDate).getTime() !== new Date(fine.fineDate).getTime();

  // If fineDate changed, re-resolve driver
  if (fineDateChanged) {
    const resolved = await resolveDriverForFine(req, fine.vehicleId, data.fineDate);
    fine.driverId = resolved ? resolved.driverId : null;
    fine.vehicleAssignmentId = resolved ? resolved.assignmentId : null;
    fine.driverName = resolved ? resolved.driverName : null;
    fine.driverEmployeeCode = resolved ? resolved.driverEmployeeCode : null;
    fine.status = resolved ? 'pending' : 'unassigned';

    const newDate = new Date(data.fineDate);
    fine.deductionPeriod = {
      year: newDate.getFullYear(),
      month: newDate.getMonth() + 1,
    };
  }

  // Update amount diff on vehicle counters
  if (data.amount !== undefined && data.amount !== fine.amount) {
    const Vehicle = getModel(req, 'Vehicle');
    const diff = data.amount - fine.amount;
    await Vehicle.findByIdAndUpdate(fine.vehicleId, {
      $inc: { totalFinesAmount: diff },
    });
  }

  // Apply allowed field updates
  const allowedFields = ['fineType', 'amount', 'fineDate', 'description', 'referenceNumber', 'notes'];
  for (const field of allowedFields) {
    if (data[field] !== undefined) {
      fine[field] = data[field];
    }
  }

  await fine.save();
  return fine;
}

/**
 * Delete a fine and decrement vehicle fine counters.
 */
async function deleteFine(req, fineId) {
  const VehicleFine = getModel(req, 'VehicleFine');
  const Vehicle = getModel(req, 'Vehicle');

  const fine = await VehicleFine.findById(fineId);
  if (!fine) {
    const err = new Error('Fine not found');
    err.statusCode = 404;
    throw err;
  }

  if (fine.status === 'deducted') {
    const err = new Error('Cannot delete a fine that has already been deducted from salary');
    err.statusCode = 400;
    throw err;
  }

  await Vehicle.findByIdAndUpdate(fine.vehicleId, {
    $inc: { totalFinesAmount: -fine.amount, totalFinesCount: -1 },
  });

  await VehicleFine.findByIdAndDelete(fineId);
  return fine;
}

/**
 * Get paginated fines for a vehicle with filters.
 */
async function getVehicleFines(req, vehicleId, filters = {}) {
  const VehicleFine = getModel(req, 'VehicleFine');

  const query = { vehicleId };
  if (filters.fineType) query.fineType = filters.fineType;
  if (filters.status) query.status = filters.status;
  if (filters.dateFrom || filters.dateTo) {
    query.fineDate = {};
    if (filters.dateFrom) query.fineDate.$gte = new Date(filters.dateFrom);
    if (filters.dateTo) query.fineDate.$lte = new Date(filters.dateTo);
  }

  const page = Math.max(1, parseInt(filters.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(filters.limit) || 20));
  const skip = (page - 1) * limit;

  const [fines, total] = await Promise.all([
    VehicleFine.find(query)
      .sort({ fineDate: -1 })
      .skip(skip)
      .limit(limit)
      .populate('driverId', 'fullName employeeCode')
      .populate('createdBy', 'name')
      .lean(),
    VehicleFine.countDocuments(query),
  ]);

  return { fines, total, page, limit };
}

/**
 * Get all fines attributed to a driver.
 */
async function getDriverFines(req, driverId, filters = {}) {
  const VehicleFine = getModel(req, 'VehicleFine');

  const query = { driverId };
  if (filters.fineType) query.fineType = filters.fineType;
  if (filters.status) query.status = filters.status;
  if (filters.dateFrom || filters.dateTo) {
    query.fineDate = {};
    if (filters.dateFrom) query.fineDate.$gte = new Date(filters.dateFrom);
    if (filters.dateTo) query.fineDate.$lte = new Date(filters.dateTo);
  }

  const page = Math.max(1, parseInt(filters.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(filters.limit) || 20));
  const skip = (page - 1) * limit;

  const [fines, total] = await Promise.all([
    VehicleFine.find(query)
      .sort({ fineDate: -1 })
      .skip(skip)
      .limit(limit)
      .populate('vehicleId', 'plate make model')
      .populate('createdBy', 'name')
      .lean(),
    VehicleFine.countDocuments(query),
  ]);

  return { fines, total, page, limit };
}

/**
 * Get pending fines for a driver in a given period (used by salary calculation).
 */
async function getPendingFinesForSalary(req, driverId, year, month) {
  const VehicleFine = getModel(req, 'VehicleFine');

  return VehicleFine.find({
    driverId,
    status: 'pending',
    'deductionPeriod.year': year,
    'deductionPeriod.month': month,
  }).lean();
}

/**
 * Bulk create fines (e.g. for salik CSV upload).
 */
async function bulkCreateFines(req, finesArray, userId) {
  const results = { created: [], errors: [] };

  for (let i = 0; i < finesArray.length; i++) {
    try {
      const fine = await createFine(req, finesArray[i], userId);
      results.created.push(fine);
    } catch (err) {
      results.errors.push({ index: i, data: finesArray[i], error: err.message });
    }
  }

  return results;
}

/**
 * Mark a fine as disputed.
 */
async function disputeFine(req, fineId, reason, userId) {
  const VehicleFine = getModel(req, 'VehicleFine');

  const fine = await VehicleFine.findById(fineId);
  if (!fine) {
    const err = new Error('Fine not found');
    err.statusCode = 404;
    throw err;
  }

  if (fine.status === 'deducted') {
    const err = new Error('Cannot dispute a fine that has already been deducted');
    err.statusCode = 400;
    throw err;
  }

  fine.status = 'disputed';
  fine.disputeReason = reason;
  await fine.save();

  return fine;
}

/**
 * Waive a fine.
 */
async function waiveFine(req, fineId, reason, userId) {
  const VehicleFine = getModel(req, 'VehicleFine');
  const Vehicle = getModel(req, 'Vehicle');

  const fine = await VehicleFine.findById(fineId);
  if (!fine) {
    const err = new Error('Fine not found');
    err.statusCode = 404;
    throw err;
  }

  if (fine.status === 'deducted') {
    const err = new Error('Cannot waive a fine that has already been deducted');
    err.statusCode = 400;
    throw err;
  }

  fine.status = 'waived';
  fine.waivedBy = userId;
  fine.waivedAt = new Date();
  fine.waiverReason = reason;
  await fine.save();

  // Decrement vehicle fine counters since this fine is waived
  await Vehicle.findByIdAndUpdate(fine.vehicleId, {
    $inc: { totalFinesAmount: -fine.amount, totalFinesCount: -1 },
  });

  return fine;
}

module.exports = {
  resolveDriverForFine,
  createFine,
  updateFine,
  deleteFine,
  getVehicleFines,
  getDriverFines,
  getPendingFinesForSalary,
  bulkCreateFines,
  disputeFine,
  waiveFine,
};
