// Public surface of the drivers module.
// Other modules must import from this file, not from internal paths.

module.exports = {
  // Router
  driversRoutes: require('./drivers.routes'),

  // Services (functions consumed by other modules)
  driverService: require('./driver.service'),
  driverStatusEngineService: require('./driverStatusEngine.service'),
  driverWorkflowService: require('./driverWorkflow.service'),
  driverHistoryService: require('./driverHistory.service'),
};
