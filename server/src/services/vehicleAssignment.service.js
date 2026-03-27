const { Vehicle, Driver, VehicleAssignment, User } = require('../models');
const { logEvent } = require('./driverHistory.service');

/**
 * Assign a vehicle to a driver.
 */
async function assignVehicle(vehicleId, driverId, data, userId) {
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
async function returnVehicle(assignmentId, data, userId) {
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
async function getVehicleHistory(vehicleId, page = 1, limit = 20) {
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
async function getDriverVehicleHistory(driverId, page = 1, limit = 20) {
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
async function getFleetSummary() {
  const [total, available, assigned, maintenance, offHired] = await Promise.all([
    Vehicle.countDocuments({ isActive: true }),
    Vehicle.countDocuments({ status: 'available', isActive: true }),
    Vehicle.countDocuments({ status: 'assigned' }),
    Vehicle.countDocuments({ status: 'maintenance' }),
    Vehicle.countDocuments({ status: 'off_hired' }),
  ]);

  return { total, available, assigned, maintenance, offHired };
}

module.exports = {
  assignVehicle,
  returnVehicle,
  getVehicleHistory,
  getDriverVehicleHistory,
  getFleetSummary,
};
