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
  if (filters.projectId) {
    query.projectId = filters.projectId;
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
      .populate('projectId', 'name')
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
  const { Client } = require('../models');
  const results = { created: 0, errors: [] };

  // Helper to safely convert any value to trimmed string (XLSX may return numbers)
  const str = (val) => (val == null ? '' : String(val).trim());

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2; // +2 for 1-indexed + header row
    try {
      const fullName = str(row.fullName);
      const nationality = str(row.nationality);
      const phoneUae = str(row.phoneUae);
      const baseSalary = str(row.baseSalary);
      const payStructure = str(row.payStructure);
      const clientRef = str(row.clientId);

      // Validate required fields
      if (!fullName) throw new Error('Full name is required');
      if (!nationality) throw new Error('Nationality is required');
      if (!phoneUae) throw new Error('UAE phone is required');
      if (!baseSalary) throw new Error('Base salary is required');
      if (!payStructure) throw new Error('Pay structure is required');
      if (!clientRef) throw new Error('Client ID is required');

      // Validate payStructure
      if (!['MONTHLY_FIXED', 'DAILY_RATE', 'PER_TRIP'].includes(payStructure)) {
        throw new Error('Pay structure must be MONTHLY_FIXED, DAILY_RATE, or PER_TRIP');
      }

      // Resolve client by name or ID
      let clientId = clientRef;
      if (!clientRef.match(/^[0-9a-fA-F]{24}$/)) {
        const client = await Client.findOne({ name: { $regex: new RegExp(`^${clientRef.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } });
        if (!client) throw new Error(`Client "${clientRef}" not found`);
        clientId = client._id;
      }

      const driverData = {
        fullName,
        nationality,
        phoneUae,
        baseSalary: Number(baseSalary),
        payStructure,
        clientId,
        createdBy: userId,
      };

      // Optional fields
      const emiratesId = str(row.emiratesId);
      const joinDate = str(row.joinDate);
      const passportNumber = str(row.passportNumber);
      const visaNumber = str(row.visaNumber);
      const bankName = str(row.bankName);
      const iban = str(row.iban);
      const vehiclePlate = str(row.vehiclePlate);
      const vehicleType = str(row.vehicleType);
      const status = str(row.status);

      if (emiratesId) driverData.emiratesId = emiratesId;
      if (joinDate) driverData.joinDate = new Date(joinDate);
      if (passportNumber) driverData.passportNumber = passportNumber;
      if (visaNumber) driverData.visaNumber = visaNumber;
      if (bankName) driverData.bankName = bankName;
      if (iban) driverData.iban = iban;
      if (vehiclePlate) driverData.vehiclePlate = vehiclePlate;
      if (vehicleType) driverData.vehicleType = vehicleType;
      if (status) driverData.status = status;

      await Driver.create(driverData);
      results.created++;
    } catch (err) {
      results.errors.push({
        row: rowNum,
        fullName: str(row.fullName) || '(empty)',
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
