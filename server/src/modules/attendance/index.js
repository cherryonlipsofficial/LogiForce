// Public surface of the attendance module.
// Other modules must import from this file, not from internal paths.

module.exports = {
  // Router
  attendanceRoutes: require('./attendance.routes'),

  // Services (functions consumed by other modules)
  attendanceService: require('./attendance.service'),
  attendanceApprovalService: require('./attendanceApproval.service'),
};
