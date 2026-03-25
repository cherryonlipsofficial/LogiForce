const { Driver, DriverLedger, DriverDocument } = require('../models');
const { PAGINATION } = require('../config/constants');

const findAll = async (filters = {}, pagination = {}) => {
  const page = parseInt(pagination.page) || PAGINATION.DEFAULT_PAGE;
  const limit = parseInt(pagination.limit) || PAGINATION.DEFAULT_LIMIT;
  const skip = (page - 1) * limit;

  const query = {};

  if (filters.status) {
    query.status = filters.status;
  }
  if (filters.clientId) {
    query.clientId = filters.clientId;
  }
  if (filters.search) {
    query.$or = [
      { fullName: { $regex: filters.search, $options: 'i' } },
      { employeeCode: { $regex: filters.search, $options: 'i' } },
      { emiratesId: { $regex: filters.search, $options: 'i' } },
      { passportNumber: { $regex: filters.search, $options: 'i' } },
    ];
  }

  const [drivers, total] = await Promise.all([
    Driver.find(query)
      .populate('clientId', 'name')
      .populate('supplierId', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Driver.countDocuments(query),
  ]);

  return { drivers, total, page, limit };
};

const findById = async (id) => {
  const driver = await Driver.findById(id)
    .populate('clientId')
    .populate('supplierId')
    .populate('createdBy', 'name email');

  if (!driver) {
    const err = new Error('Driver not found');
    err.statusCode = 404;
    throw err;
  }
  return driver;
};

const create = async (data, userId) => {
  data.createdBy = userId;
  const driver = await Driver.create(data);
  return driver;
};

const update = async (id, data) => {
  const driver = await Driver.findByIdAndUpdate(id, data, {
    new: true,
    runValidators: true,
  });

  if (!driver) {
    const err = new Error('Driver not found');
    err.statusCode = 404;
    throw err;
  }
  return driver;
};

const softDelete = async (id) => {
  const driver = await Driver.findByIdAndUpdate(
    id,
    { status: 'resigned' },
    { new: true }
  );

  if (!driver) {
    const err = new Error('Driver not found');
    err.statusCode = 404;
    throw err;
  }
  return driver;
};

const getLedger = async (driverId, pagination = {}) => {
  const page = parseInt(pagination.page) || PAGINATION.DEFAULT_PAGE;
  const limit = parseInt(pagination.limit) || PAGINATION.DEFAULT_LIMIT;
  const skip = (page - 1) * limit;

  const [entries, total] = await Promise.all([
    DriverLedger.find({ driverId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('createdBy', 'name'),
    DriverLedger.countDocuments({ driverId }),
  ]);

  return { entries, total, page, limit };
};

const getExpiringDocuments = async (days = 30) => {
  const now = new Date();
  const threshold = new Date();
  threshold.setDate(threshold.getDate() + days);

  const docs = await DriverDocument.find({
    expiryDate: { $gte: now, $lte: threshold },
    status: { $ne: 'expired' },
  }).populate('driverId', 'fullName employeeCode clientId status');

  return docs;
};

const getStatusCounts = async () => {
  const [total, active, onLeave, suspended] = await Promise.all([
    Driver.countDocuments({}),
    Driver.countDocuments({ status: 'active' }),
    Driver.countDocuments({ status: 'on_leave' }),
    Driver.countDocuments({ status: 'suspended' }),
  ]);
  return { total, active, onLeave, suspended };
};

const bulkCreate = async (rows, userId) => {
  const results = { created: 0, errors: [] };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2; // +2 for 1-indexed + header row
    try {
      // Validate required fields
      if (!row.fullName) throw new Error('Full name is required');
      if (!row.nationality) throw new Error('Nationality is required');
      if (!row.phoneUae) throw new Error('UAE phone is required');
      if (!row.baseSalary) throw new Error('Base salary is required');
      if (!row.payStructure) throw new Error('Pay structure is required');
      if (!row.clientId) throw new Error('Client ID is required');

      // Validate payStructure
      if (!['MONTHLY_FIXED', 'DAILY_RATE', 'PER_TRIP'].includes(row.payStructure)) {
        throw new Error('Pay structure must be MONTHLY_FIXED, DAILY_RATE, or PER_TRIP');
      }

      // Resolve client by name or ID
      const { Client } = require('../models');
      let clientId = row.clientId;
      if (!clientId.match(/^[0-9a-fA-F]{24}$/)) {
        const client = await Client.findOne({ name: { $regex: new RegExp(`^${row.clientId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } });
        if (!client) throw new Error(`Client "${row.clientId}" not found`);
        clientId = client._id;
      }

      const driverData = {
        fullName: row.fullName.trim(),
        nationality: row.nationality.trim(),
        phoneUae: row.phoneUae.trim(),
        baseSalary: Number(row.baseSalary),
        payStructure: row.payStructure.trim(),
        clientId,
        createdBy: userId,
      };

      // Optional fields
      if (row.emiratesId) driverData.emiratesId = row.emiratesId.trim();
      if (row.joinDate) driverData.joinDate = new Date(row.joinDate);
      if (row.passportNumber) driverData.passportNumber = row.passportNumber.trim();
      if (row.visaNumber) driverData.visaNumber = row.visaNumber.trim();
      if (row.bankName) driverData.bankName = row.bankName.trim();
      if (row.iban) driverData.iban = row.iban.trim();
      if (row.vehiclePlate) driverData.vehiclePlate = row.vehiclePlate.trim();
      if (row.vehicleType) driverData.vehicleType = row.vehicleType.trim();
      if (row.status) driverData.status = row.status.trim();

      await Driver.create(driverData);
      results.created++;
    } catch (err) {
      results.errors.push({
        row: rowNum,
        fullName: row.fullName || '(empty)',
        message: err.message || 'Unknown error',
      });
    }
  }

  return results;
};

module.exports = {
  findAll,
  findById,
  create,
  update,
  softDelete,
  getLedger,
  getExpiringDocuments,
  getStatusCounts,
  bulkCreate,
};
