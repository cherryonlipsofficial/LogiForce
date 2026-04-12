// Public surface of the payroll module.
// Other modules must import from this file, not from internal paths.

module.exports = {
  // Routers
  salaryRoutes: require('./salary.routes'),
  advancesRoutes: require('./advances.routes'),
  driverReceivablesRoutes: require('./driverReceivables.routes'),

  // Services (functions consumed by other modules)
  salaryService: require('./salary.service'),
  salaryRunService: require('./salaryRun.service'),
  salaryReminderService: require('./salaryReminder.service'),
  driverAdvanceService: require('./driverAdvance.service'),
  driverReceivableService: require('./driverReceivable.service'),
};
