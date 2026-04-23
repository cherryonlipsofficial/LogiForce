// Public surface of the shared module.
// Other modules must import from this file, not from internal paths.

module.exports = {
  // Routers
  authRoutes: require('./auth.routes'),
  usersRoutes: require('./users.routes'),
  rolesRoutes: require('./roles.routes'),
  notificationsRoutes: require('./notifications.routes'),
  settingsRoutes: require('./settings.routes'),

  // Services (functions consumed by other modules)
  notificationService: require('./notification.service'),
  authService: require('./auth.service'),
  pendingApprovalsService: require('./pendingApprovals.service'),
};
