// Public surface of the compliance module.
// Other modules must import from this file, not from internal paths.

module.exports = {
  // Routers
  guaranteePassportRoutes: require('./guaranteePassport.routes'),
  driverClearanceRoutes: require('./driverClearance.routes'),
  driverVisasRoutes: require('./driverVisas.routes'),

  // Services (functions consumed by other modules)
  guaranteePassportService: require('./guaranteePassport.service'),
  driverClearanceService: require('./driverClearance.service'),
  driverVisaService: require('./driverVisa.service'),
};
