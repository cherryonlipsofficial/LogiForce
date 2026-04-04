/**
 * Model Registry
 *
 * Instead of: const User = require('../models/User')
 * You now do:  const User = getModel(req, 'User')
 *
 * This returns the model bound to the tenant's DB connection.
 */

// Import only the SCHEMAS, not the compiled models
const schemas = {
  User: require('../models/User').schema,
  Role: require('../models/Role').schema,
  Driver: require('../models/Driver').schema,
  Client: require('../models/Client').schema,
  Supplier: require('../models/Supplier').schema,
  Vehicle: require('../models/Vehicle').schema,
  VehicleAssignment: require('../models/VehicleAssignment').schema,
  Project: require('../models/Project').schema,
  ProjectContract: require('../models/ProjectContract').schema,
  AttendanceBatch: require('../models/AttendanceBatch').schema,
  AttendanceRecord: require('../models/AttendanceRecord').schema,
  AttendanceDispute: require('../models/AttendanceDispute').schema,
  Invoice: require('../models/Invoice').schema,
  CreditNote: require('../models/CreditNote').schema,
  Advance: require('../models/Advance').schema,
  DriverAdvance: require('../models/DriverAdvance').schema,
  DriverDocument: require('../models/DriverDocument').schema,
  DriverHistory: require('../models/DriverHistory').schema,
  DriverLedger: require('../models/DriverLedger').schema,
  DriverProjectAssignment: require('../models/DriverProjectAssignment').schema,
  DriverReceivable: require('../models/DriverReceivable').schema,
  GuaranteePassport: require('../models/GuaranteePassport').schema,
  SalaryRun: require('../models/SalaryRun').schema,
  CompanySettings: require('../models/CompanySettings').schema,
  AuditLog: require('../models/AuditLog').schema,
  AppNotification: require('../models/AppNotification').schema,
  VehicleFine: require('../models/VehicleFine').schema,
  TelecomSim: require('../models/TelecomSim').schema,
  SimAssignment: require('../models/SimAssignment').schema,
  SimBill: require('../models/SimBill').schema,
};

/**
 * Get a model bound to the current request's tenant DB connection.
 *
 * @param {Request} req  - Express request (must have req.dbConnection set by tenant middleware)
 * @param {string} modelName - e.g. 'User', 'Driver'
 * @returns {mongoose.Model}
 */
const getModel = (req, modelName) => {
  const conn = req.dbConnection;
  if (!conn) {
    throw new Error('No database connection on request. Is tenant middleware applied?');
  }

  // conn.models caches compiled models per connection
  if (conn.models[modelName]) {
    return conn.models[modelName];
  }

  const schema = schemas[modelName];
  if (!schema) {
    throw new Error(`Unknown model: ${modelName}`);
  }

  return conn.model(modelName, schema);
};

/**
 * Get a model for a specific connection (used by cron jobs, seeds, etc.)
 */
const getModelForConnection = (conn, modelName) => {
  if (conn.models[modelName]) return conn.models[modelName];
  const schema = schemas[modelName];
  if (!schema) throw new Error(`Unknown model: ${modelName}`);
  return conn.model(modelName, schema);
};

module.exports = { getModel, getModelForConnection, schemas };
