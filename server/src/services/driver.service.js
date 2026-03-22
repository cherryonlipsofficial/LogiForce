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

module.exports = {
  findAll,
  findById,
  create,
  update,
  softDelete,
  getLedger,
  getExpiringDocuments,
};
