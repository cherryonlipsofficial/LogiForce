const { getModel } = require('../config/modelRegistry');
const { logEvent } = require('../modules/drivers/driverHistory.service');

/**
 * Assign a vehicle to a driver.
 */
async function assignVehicle(req, vehicleId, driverId, data, userId) {
  const Vehicle = getModel(req, 'Vehicle');
  const Driver = getModel(req, 'Driver');
  const VehicleAssignment = getModel(req, 'VehicleAssignment');
  const User = getModel(req, 'User');

  // 1. Fetch vehicle
  const vehicle = await Vehicle.findById(vehicleId);
  if (!vehicle) {
    const err = new Error('Vehicle not found');
    err.statusCode = 404;
    throw err;
  }

  // 2. Check vehicle status
  if (vehicle.status === 'assigned') {
    const err = new Error(
      'Vehicle is already assigned to another driver. Return it first before reassigning.'
    );
    err.statusCode = 400;
    throw err;
  }
  if (vehicle.status === 'off_hired') {
    const err = new Error('This vehicle has been off-hired and cannot be assigned.');
    err.statusCode = 400;
    throw err;
  }
  if (vehicle.status === 'maintenance') {
    const err = new Error('This vehicle is under maintenance and cannot be assigned.');
    err.statusCode = 400;
    throw err;
  }

  // 3. Fetch driver
  const driver = await Driver.findById(driverId);
  if (!driver) {
    const err = new Error('Driver not found');
    err.statusCode = 404;
    throw err;
  }

  // 4. Check driver status — only active drivers can be assigned
  if (driver.status !== 'active') {
    const err = new Error(
      `Cannot assign vehicle to a driver with status "${driver.status}". Only active drivers can be assigned a vehicle.`
    );
    err.statusCode = 400;
    throw err;
  }

  // 5. Check if driver already has a vehicle assigned
  if (driver.currentVehicleId) {
    const currentVehicle = await Vehicle.findById(driver.currentVehicleId).select('plate');
    const plateNumber = currentVehicle ? currentVehicle.plate : 'unknown';
    const err = new Error(
      `Driver already has vehicle ${plateNumber} assigned. Return that vehicle first before assigning a new one.`
    );
    err.statusCode = 400;
    throw err;
  }

  // 6. Fetch assigning user for denormalization
  const assigningUser = await User.findById(userId).select('name');

  // 7. Build make/model string
  const vehicleMakeModel = [vehicle.make, vehicle.model].filter(Boolean).join(' ') || '';

  // 8. Create VehicleAssignment record
  const assignment = await VehicleAssignment.create({
    vehicleId,
    driverId,
    clientId: driver.clientId,
    projectId: driver.projectId,
    vehiclePlateNumber: vehicle.plate,
    vehicleMakeModel,
    driverName: driver.fullName,
    driverEmployeeCode: driver.employeeCode,
    assignedDate: new Date(),
    expectedReturnDate: data.expectedReturnDate || null,
    monthlyDeductionAmount: data.monthlyDeductionAmount || 0,
    status: 'active',
    assignedBy: userId,
    assignedByName: assigningUser ? assigningUser.name : null,
    notes: data.notes || null,
  });

  // 9. Update Vehicle
  vehicle.status = 'assigned';
  vehicle.currentDriverId = driverId;
  vehicle.currentAssignmentId = assignment._id;
  vehicle.lastIdleSince = null;
  vehicle.totalAssignments = (vehicle.totalAssignments || 0) + 1;
  await vehicle.save();

  // 10. Update Driver
  driver.currentVehicleId = vehicleId;
  driver.currentVehicleAssignmentId = assignment._id;
  await driver.save();

  // 11. Log to DriverHistory
  await logEvent(
    driverId,
    'field_updated',
    {
      description: `Vehicle assigned: ${vehicle.plate} (${vehicleMakeModel}) by ${assigningUser ? assigningUser.name : 'System'}`,
      fieldName: 'currentVehicleId',
      newValue: vehicle.plate,
      metadata: {
        vehicleId,
        assignmentId: assignment._id,
        plateNumber: vehicle.plate,
      },
    },
    userId
  );

  // 12. Return populated assignment
  return VehicleAssignment.findById(assignment._id)
    .populate('vehicleId', 'plate status')
    .populate('driverId', 'fullName employeeCode')
    .populate('assignedBy', 'name');
}

/**
 * Return a vehicle (end an assignment).
 */
async function returnVehicle(req, assignmentId, data, userId) {
  const Vehicle = getModel(req, 'Vehicle');
  const Driver = getModel(req, 'Driver');
  const VehicleAssignment = getModel(req, 'VehicleAssignment');
  const User = getModel(req, 'User');

  // 1. Find assignment
  const assignment = await VehicleAssignment.findById(assignmentId);
  if (!assignment) {
    const err = new Error('Assignment not found');
    err.statusCode = 404;
    throw err;
  }
  if (assignment.status === 'returned') {
    const err = new Error('This vehicle has already been returned.');
    err.statusCode = 400;
    throw err;
  }

  // 2. Fetch user for denormalization
  const returningUser = await User.findById(userId).select('name');

  // 3. Update assignment
  assignment.status = 'returned';
  assignment.returnedDate = new Date();
  assignment.returnCondition = data.returnCondition || 'good';
  assignment.damageNotes = data.damageNotes || null;
  assignment.damagePenaltyAmount = data.damagePenaltyAmount || 0;
  assignment.returnedBy = userId;
  assignment.returnedByName = returningUser ? returningUser.name : null;
  await assignment.save();

  // 4. Update Vehicle
  const vehicle = await Vehicle.findById(assignment.vehicleId);
  if (vehicle) {
    vehicle.status = 'available';
    vehicle.currentDriverId = null;
    vehicle.currentAssignmentId = null;
    vehicle.lastIdleSince = new Date();
    await vehicle.save();
  }

  // 5. Update Driver
  const driver = await Driver.findById(assignment.driverId);
  if (driver) {
    driver.currentVehicleId = null;
    driver.currentVehicleAssignmentId = null;
    await driver.save();
  }

  // 6. Log damage penalty if applicable
  const damagePenaltyAmount = data.damagePenaltyAmount || 0;
  if (damagePenaltyAmount > 0) {
    await logEvent(
      assignment.driverId,
      'field_updated',
      {
        description: `Vehicle damage penalty: AED ${damagePenaltyAmount} for ${assignment.vehiclePlateNumber}`,
        fieldName: 'penalty',
        newValue: String(damagePenaltyAmount),
        metadata: {
          assignmentId,
          vehicleId: assignment.vehicleId,
          damagePenaltyAmount,
        },
      },
      userId
    );
  }

  // 7. Log vehicle return to DriverHistory
  await logEvent(
    assignment.driverId,
    'field_updated',
    {
      description: `Vehicle returned: ${assignment.vehiclePlateNumber} — Condition: ${data.returnCondition || 'good'}`,
      fieldName: 'currentVehicleId',
      oldValue: assignment.vehiclePlateNumber,
      newValue: null,
      metadata: {
        vehicleId: assignment.vehicleId,
        assignmentId,
        returnCondition: data.returnCondition,
      },
    },
    userId
  );

  // 8. Return updated assignment
  return assignment;
}

/**
 * Get assignment history for a vehicle (paginated, newest first).
 */
async function getVehicleHistory(req, vehicleId, page = 1, limit = 20) {
  const VehicleAssignment = getModel(req, 'VehicleAssignment');

  page = Math.max(1, parseInt(page) || 1);
  limit = Math.min(100, Math.max(1, parseInt(limit) || 20));
  const skip = (page - 1) * limit;

  const [assignments, total] = await Promise.all([
    VehicleAssignment.find({ vehicleId })
      .sort({ assignedDate: -1 })
      .skip(skip)
      .limit(limit)
      .populate('driverId', 'fullName employeeCode')
      .populate('assignedBy', 'name')
      .populate('returnedBy', 'name')
      .lean(),
    VehicleAssignment.countDocuments({ vehicleId }),
  ]);

  return { assignments, total, page, limit };
}

/**
 * Get vehicle assignment history for a driver (paginated, newest first).
 */
async function getDriverVehicleHistory(req, driverId, page = 1, limit = 20) {
  const VehicleAssignment = getModel(req, 'VehicleAssignment');

  page = Math.max(1, parseInt(page) || 1);
  limit = Math.min(100, Math.max(1, parseInt(limit) || 20));
  const skip = (page - 1) * limit;

  const [assignments, total] = await Promise.all([
    VehicleAssignment.find({ driverId })
      .sort({ assignedDate: -1 })
      .skip(skip)
      .limit(limit)
      .populate('vehicleId', 'plate')
      .populate('assignedBy', 'name')
      .populate('returnedBy', 'name')
      .lean(),
    VehicleAssignment.countDocuments({ driverId }),
  ]);

  return { assignments, total, page, limit };
}

/**
 * Fleet summary: count vehicles by status.
 */
async function getFleetSummary(req) {
  const Vehicle = getModel(req, 'Vehicle');

  const [total, available, assigned, maintenance, offHired] = await Promise.all([
    Vehicle.countDocuments({ isActive: true }),
    Vehicle.countDocuments({ status: 'available', isActive: true }),
    Vehicle.countDocuments({ status: 'assigned' }),
    Vehicle.countDocuments({ status: 'maintenance' }),
    Vehicle.countDocuments({ status: 'off_hired' }),
  ]);

  return { total, available, assigned, maintenance, offHired };
}

/**
 * Get a complete assignment timeline for a vehicle, including idle periods.
 */
async function getVehicleTimeline(req, vehicleId) {
  const Vehicle = getModel(req, 'Vehicle');
  const VehicleAssignment = getModel(req, 'VehicleAssignment');

  const vehicle = await Vehicle.findById(vehicleId).lean();
  if (!vehicle) {
    const err = new Error('Vehicle not found');
    err.statusCode = 404;
    throw err;
  }

  const assignments = await VehicleAssignment.find({ vehicleId })
    .sort({ assignedDate: 1 })
    .populate('driverId', 'fullName employeeCode')
    .lean();

  const timeline = [];
  const now = new Date();
  const dayMs = 24 * 60 * 60 * 1000;

  // Use vehicle createdAt as the starting reference for first idle gap
  let lastEndDate = vehicle.createdAt ? new Date(vehicle.createdAt) : null;

  for (const a of assignments) {
    const assignedDate = new Date(a.assignedDate);
    const returnedDate = a.returnedDate ? new Date(a.returnedDate) : null;

    // Idle gap before this assignment
    if (lastEndDate && assignedDate > lastEndDate) {
      const idleDays = Math.round((assignedDate - lastEndDate) / dayMs);
      if (idleDays > 0) {
        timeline.push({
          type: 'idle',
          startDate: lastEndDate,
          endDate: assignedDate,
          durationDays: idleDays,
        });
      }
    }

    const durationDays = returnedDate
      ? Math.round((returnedDate - assignedDate) / dayMs)
      : Math.round((now - assignedDate) / dayMs);

    if (returnedDate) {
      timeline.push({
        type: 'assignment',
        driverId: a.driverId?._id || a.driverId,
        driverName: a.driverId?.fullName || a.driverName,
        driverCode: a.driverId?.employeeCode || a.driverEmployeeCode,
        assignedDate,
        returnedDate,
        durationDays,
        condition: a.returnCondition,
      });
      lastEndDate = returnedDate;
    } else {
      // Currently active assignment
      timeline.push({
        type: 'current_assignment',
        driverId: a.driverId?._id || a.driverId,
        driverName: a.driverId?.fullName || a.driverName,
        driverCode: a.driverId?.employeeCode || a.driverEmployeeCode,
        assignedDate,
        durationDays,
      });
      lastEndDate = null; // no trailing idle
    }
  }

  // If last assignment was returned, vehicle is currently idle
  if (lastEndDate) {
    const idleDays = Math.round((now - lastEndDate) / dayMs);
    if (idleDays > 0) {
      timeline.push({
        type: 'current_idle',
        startDate: lastEndDate,
        durationDays: idleDays,
      });
    }
  }

  return timeline;
}

/**
 * Get fleet dashboard statistics.
 */
async function getFleetDashboardStats(req) {
  const Vehicle = getModel(req, 'Vehicle');
  const VehicleFine = getModel(req, 'VehicleFine');

  const now = new Date();
  const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const ago7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const dayMs = 24 * 60 * 60 * 1000;

  // Status counts
  const [assigned, available, maintenance, offHired, totalVehicles] = await Promise.all([
    Vehicle.countDocuments({ status: 'assigned' }),
    Vehicle.countDocuments({ status: 'available' }),
    Vehicle.countDocuments({ status: 'maintenance' }),
    Vehicle.countDocuments({ status: 'off_hired' }),
    Vehicle.countDocuments({}),
  ]);

  // Contracts expiring in 7 days
  const contractsExpiringIn7Days = await Vehicle.find({
    contractEnd: { $gte: now, $lte: in7Days },
    status: { $ne: 'off_hired' },
  })
    .populate('supplierId', 'name')
    .select('plate make model contractEnd supplierId')
    .lean()
    .then((vehicles) =>
      vehicles.map((v) => ({
        _id: v._id,
        plate: v.plate,
        make: v.make,
        model: v.model,
        contractEnd: v.contractEnd,
        daysRemaining: Math.ceil((new Date(v.contractEnd) - now) / dayMs),
        supplierName: v.supplierId?.name || null,
      }))
    );

  // Contracts expiring in 30 days
  const contractsExpiringIn30Days = await Vehicle.find({
    contractEnd: { $gte: now, $lte: in30Days },
    status: { $ne: 'off_hired' },
  })
    .populate('supplierId', 'name')
    .select('plate make model contractEnd supplierId')
    .lean()
    .then((vehicles) =>
      vehicles.map((v) => ({
        _id: v._id,
        plate: v.plate,
        make: v.make,
        model: v.model,
        contractEnd: v.contractEnd,
        daysRemaining: Math.ceil((new Date(v.contractEnd) - now) / dayMs),
        supplierName: v.supplierId?.name || null,
      }))
    );

  // Vehicles idle over 7 days
  const vehiclesIdleOver7Days = await Vehicle.find({
    status: 'available',
    lastIdleSince: { $lte: ago7Days },
  })
    .select('plate lastIdleSince')
    .lean()
    .then((vehicles) =>
      vehicles.map((v) => ({
        _id: v._id,
        plate: v.plate,
        lastIdleSince: v.lastIdleSince,
        idleDays: Math.round((now - new Date(v.lastIdleSince)) / dayMs),
      }))
    );

  // Average idle days for idle vehicles
  const idleVehicles = await Vehicle.find({
    status: 'available',
    lastIdleSince: { $ne: null },
  })
    .select('lastIdleSince')
    .lean();

  const avgIdleDays =
    idleVehicles.length > 0
      ? Math.round(
          idleVehicles.reduce((sum, v) => sum + (now - new Date(v.lastIdleSince)) / dayMs, 0) /
            idleVehicles.length
        )
      : 0;

  // Utilization rate: assigned / (total - offHired)
  const denominator = totalVehicles - offHired;
  const utilizationRate = denominator > 0 ? Math.round((assigned / denominator) * 10000) / 100 : 0;

  // By lease type
  const leaseTypeAgg = await Vehicle.aggregate([
    { $group: { _id: '$leaseType', count: { $sum: 1 } } },
  ]);
  const byLeaseType = {};
  for (const lt of leaseTypeAgg) {
    byLeaseType[lt._id || 'rental'] = lt.count;
  }

  // By supplier
  const bySupplier = await Vehicle.aggregate([
    { $group: { _id: '$supplierId', total: { $sum: 1 }, statuses: { $push: '$status' } } },
    { $lookup: { from: 'suppliers', localField: '_id', foreignField: '_id', as: 'supplier' } },
    { $unwind: { path: '$supplier', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        supplierId: '$_id',
        name: { $ifNull: ['$supplier.name', 'No Supplier'] },
        total: 1,
        statuses: 1,
      },
    },
  ]);

  const bySupplierFormatted = bySupplier.map((s) => ({
    supplierId: s.supplierId,
    name: s.name,
    total: s.total,
    assigned: s.statuses.filter((st) => st === 'assigned').length,
    available: s.statuses.filter((st) => st === 'available').length,
    offHired: s.statuses.filter((st) => st === 'off_hired').length,
  }));

  // Total monthly rent for active vehicles
  const rentAgg = await Vehicle.aggregate([
    { $match: { status: { $in: ['assigned', 'available', 'maintenance'] } } },
    { $group: { _id: null, totalMonthlyRent: { $sum: '$monthlyRate' } } },
  ]);
  const totalMonthlyRent = rentAgg.length > 0 ? rentAgg[0].totalMonthlyRent : 0;

  // Documents expiring (mulkiya, insurance, registration)
  const documentsExpiring = [];
  const docFields = [
    { field: 'mulkiyaExpiry', label: 'Mulkiya' },
    { field: 'insuranceExpiry', label: 'Insurance' },
    { field: 'registrationExpiry', label: 'Registration' },
  ];

  for (const { field, label } of docFields) {
    const expiring = await Vehicle.find({
      [field]: { $gte: now, $lte: in30Days },
      status: { $ne: 'off_hired' },
    })
      .select(`plate ${field}`)
      .lean();

    for (const v of expiring) {
      documentsExpiring.push({
        _id: v._id,
        plate: v.plate,
        documentType: label,
        expiryDate: v[field],
        daysRemaining: Math.ceil((new Date(v[field]) - now) / dayMs),
      });
    }
  }
  documentsExpiring.sort((a, b) => a.daysRemaining - b.daysRemaining);

  // Recent fines
  const recentFines = await VehicleFine.find({})
    .sort({ createdAt: -1 })
    .limit(5)
    .populate('vehicleId', 'plate')
    .populate('driverId', 'fullName employeeCode')
    .lean();

  return {
    activeVehicles: assigned,
    idleVehicles: available,
    maintenanceVehicles: maintenance,
    offHiredVehicles: offHired,
    totalVehicles,
    contractsExpiringIn7Days,
    contractsExpiringIn30Days,
    vehiclesIdleOver7Days,
    avgIdleDays,
    utilizationRate,
    byLeaseType,
    bySupplier: bySupplierFormatted,
    totalMonthlyRent,
    documentsExpiring,
    recentFines,
  };
}

module.exports = {
  assignVehicle,
  returnVehicle,
  getVehicleHistory,
  getDriverVehicleHistory,
  getFleetSummary,
  getVehicleTimeline,
  getFleetDashboardStats,
};
