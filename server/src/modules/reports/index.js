// Public surface of the reports module.
// Reports is a cross-cutting read-only module; nothing imports from it.

module.exports = {
  // Router
  reportsRoutes: require('./reports.routes'),
};
