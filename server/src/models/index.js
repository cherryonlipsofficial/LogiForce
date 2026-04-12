const User = require('../modules/shared/User');
const Role = require('../modules/shared/Role');
const Driver = require('./Driver');
const Client = require('./Client');
const Supplier = require('./Supplier');
const AttendanceBatch = require('./AttendanceBatch');
const AttendanceRecord = require('./AttendanceRecord');
const SalaryRun = require('./SalaryRun');
const DriverLedger = require('./DriverLedger');
const Invoice = require('./Invoice');
const Advance = require('./Advance');
const DriverDocument = require('./DriverDocument');
const AuditLog = require('../modules/shared/AuditLog');
const Vehicle = require('./Vehicle');
const Project = require('./Project');
const ProjectContract = require('./ProjectContract');
const DriverProjectAssignment = require('./DriverProjectAssignment');
const DriverHistory = require('./DriverHistory');
const VehicleAssignment = require('./VehicleAssignment');
const GuaranteePassport = require('./GuaranteePassport');
const AttendanceDispute = require('./AttendanceDispute');
const AppNotification = require('../modules/shared/AppNotification');
const DriverAdvance = require('./DriverAdvance');
const CompanySettings = require('../modules/shared/CompanySettings');
const CreditNote = require('./CreditNote');
const DriverReceivable = require('./DriverReceivable');
const VehicleFine = require('./VehicleFine');
const TelecomSim = require('./TelecomSim');
const SimAssignment = require('./SimAssignment');
const SimBill = require('./SimBill');
const DriverClearance = require('./DriverClearance');
const DriverVisa = require('./DriverVisa');

module.exports = {
  User,
  Role,
  Driver,
  Client,
  Supplier,
  AttendanceBatch,
  AttendanceRecord,
  SalaryRun,
  DriverLedger,
  Invoice,
  Advance,
  DriverDocument,
  AuditLog,
  Vehicle,
  Project,
  ProjectContract,
  DriverProjectAssignment,
  DriverHistory,
  VehicleAssignment,
  GuaranteePassport,
  AttendanceDispute,
  AppNotification,
  DriverAdvance,
  CompanySettings,
  CreditNote,
  DriverReceivable,
  VehicleFine,
  TelecomSim,
  SimAssignment,
  SimBill,
  DriverClearance,
  DriverVisa,
};
