const User = require('../modules/shared/User');
const Role = require('../modules/shared/Role');
const Driver = require('../modules/drivers/Driver');
const Client = require('../modules/billing/Client');
const Supplier = require('../modules/billing/Supplier');
const AttendanceBatch = require('../modules/attendance/AttendanceBatch');
const AttendanceRecord = require('../modules/attendance/AttendanceRecord');
const SalaryRun = require('../modules/payroll/SalaryRun');
const DriverLedger = require('../modules/payroll/DriverLedger');
const Invoice = require('../modules/billing/Invoice');
const Advance = require('../modules/payroll/Advance');
const DriverDocument = require('../modules/drivers/DriverDocument');
const AuditLog = require('../modules/shared/AuditLog');
const Vehicle = require('../modules/fleet/Vehicle');
const Project = require('../modules/billing/Project');
const ProjectContract = require('../modules/billing/ProjectContract');
const DriverProjectAssignment = require('../modules/billing/DriverProjectAssignment');
const DriverHistory = require('../modules/drivers/DriverHistory');
const VehicleAssignment = require('../modules/fleet/VehicleAssignment');
const GuaranteePassport = require('./GuaranteePassport');
const AttendanceDispute = require('../modules/attendance/AttendanceDispute');
const AppNotification = require('../modules/shared/AppNotification');
const DriverAdvance = require('../modules/payroll/DriverAdvance');
const CompanySettings = require('../modules/shared/CompanySettings');
const CreditNote = require('../modules/billing/CreditNote');
const DriverReceivable = require('../modules/payroll/DriverReceivable');
const VehicleFine = require('../modules/fleet/VehicleFine');
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
