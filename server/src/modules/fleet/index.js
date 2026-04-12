// Public surface of the fleet module.
// Other modules must import from this file, not from internal paths.

module.exports = {
  // Routers
  vehiclesRoutes: require('./vehicles.routes'),
  vehicleFinesRoutes: require('./vehicleFines.routes'),

  // Services (functions consumed by other modules)
  vehicleAssignmentService: require('./vehicleAssignment.service'),
  vehicleFineService: require('./vehicleFine.service'),
};
