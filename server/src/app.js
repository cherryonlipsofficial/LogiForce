/**
 * The Express app, without listening or connecting to anything. server.js
 * connects the platform database, then listens; tests build the app directly.
 *
 * Order matters:
 *   /api/health            no tenant, no auth
 *   /api/platform/*        platform console API, no tenant (its own 404)
 *   /api/*                 resolveTenant, then the company routes
 */
require('express-async-errors');

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const errorHandler = require('./middleware/errorHandler');
const { resolveTenant } = require('./middleware/tenant');
const { isAllowedOrigin } = require('./config/appDomain');
const platformDb = require('./platform/db');

const createApp = () => {
  const app = express();

  // Render (and the nginx in docker-compose) put exactly one proxy in front of
  // the API. Trust that one hop so req.ip is the real client IP, which the rate
  // limiters and audit logs rely on.
  app.set('trust proxy', 1);

  // CORS: every https://<company>.<APP_DOMAIN>, the console at admin.<APP_DOMAIN>,
  // localhost, and any extra origins in CLIENT_URL (comma-separated).
  app.use(cors({
    origin: (origin, callback) => {
      const allowed = isAllowedOrigin(origin);
      callback(allowed ? null : new Error('CORS blocked'), allowed);
    },
    credentials: true,
  }));

  app.use(helmet());
  app.disable('x-powered-by');

  if (process.env.NODE_ENV === 'test') {
    // quiet
  } else if (process.env.NODE_ENV !== 'production') {
    app.use(morgan('dev'));
  } else {
    // In production, use short format to stdout — Winston handles structured logging
    app.use(morgan('short'));
  }

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Global API rate limiter — 200 requests per minute per IP
  app.use('/api', rateLimit({
    windowMs: 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many requests. Please try again shortly.' },
    skip: (req) => req.path === '/api/health' || process.env.NODE_ENV === 'test',
  }));

  // Prevent caching on API responses
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.set('Pragma', 'no-cache');
    next();
  });

  // Health check — ABOVE tenant middleware (no tenant required). Healthy when
  // the platform database (the company registry) is reachable.
  app.get('/api/health', async (req, res) => {
    let state = 0;
    try {
      state = platformDb.getPlatformConnection().readyState;
    } catch {
      state = 0; // not connected yet
    }
    const isHealthy = state === 1;
    res.status(isHealthy ? 200 : 503).json({
      status: isHealthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
      platformDb: isHealthy ? 'connected' : 'disconnected',
    });
  });

  // Platform (product-owner) API — ABOVE tenant middleware. Its router ends with
  // its own 404, so /api/platform/* never falls through to resolveTenant.
  app.use('/api/platform', require('./platform/platform.routes'));

  // Tenant middleware: ALL /api routes below require a tenant
  app.use('/api', resolveTenant);

  // Audit middleware: logs every successful mutating request to AuditLog once the
  // response is sent. Registered before the route handlers so its res.on('finish')
  // hook runs after each route's protect middleware has populated req.user.
  app.use('/api', require('./middleware/auditActivity'));

  app.use('/api/auth', require('./modules/shared/auth.routes'));
  app.use('/api/drivers', require('./modules/drivers/drivers.routes'));
  app.use('/api/clients', require('./modules/billing/clients.routes'));
  app.use('/api/suppliers', require('./modules/billing/suppliers.routes'));
  app.use('/api/attendance', require('./modules/attendance/attendance.routes'));
  app.use('/api/invoices', require('./modules/billing/invoices.routes'));
  app.use('/api/credit-notes', require('./modules/billing/creditNotes.routes'));
  app.use('/api/reports', require('./modules/reports/reports.routes'));
  app.use('/api/advances', require('./modules/payroll/advances.routes'));
  app.use('/api/salary', require('./modules/payroll/salary.routes'));
  app.use('/api/receivables', require('./modules/payroll/driverReceivables.routes'));
  app.use('/api/vehicles', require('./modules/fleet/vehicles.routes'));
  app.use('/api/vehicle-fines', require('./modules/fleet/vehicleFines.routes'));
  app.use('/api/projects', require('./modules/billing/projects.routes'));
  app.use('/api/roles', require('./modules/shared/roles.routes'));
  app.use('/api/users', require('./modules/shared/users.routes'));
  app.use('/api', require('./modules/compliance/guaranteePassport.routes'));
  app.use('/api/notifications', require('./modules/shared/notifications.routes'));
  app.use('/api/settings', require('./modules/shared/settings.routes'));
  app.use('/api/simcards', require('./modules/telecom/simcards.routes'));
  app.use('/api/driver-clearance', require('./modules/compliance/driverClearance.routes'));
  app.use('/api/driver-visas', require('./modules/compliance/driverVisas.routes'));
  app.use('/api/activity-log', require('./modules/shared/activityLog.routes'));

  app.use(errorHandler);
  return app;
};

/**
 * Why the server can't start, or null. Never includes a secret's value.
 */
const startupEnvProblems = () => {
  const { platformAuthEnvProblem } = require('./platform/config');
  const { getAppDomain } = require('./config/appDomain');
  const problems = [];
  if (!(process.env.PLATFORM_MONGODB_URI || '').trim()) {
    problems.push('PLATFORM_MONGODB_URI is not set. It is the MongoDB URI of the platform database, '
      + 'which holds the company list, platform users and the audit log.');
  }
  if (!(process.env.MONGODB_BASE_URI || '').trim()) {
    problems.push('MONGODB_BASE_URI is not set. Company databases are opened at MONGODB_BASE_URI/<dbName> '
      + '(e.g. mongodb+srv://user:pass@cluster0.example.mongodb.net).');
  }
  if (!getAppDomain()) {
    problems.push('APP_DOMAIN is not set. Companies are served at https://<key>.<APP_DOMAIN> '
      + '(e.g. APP_DOMAIN=logiforce.app).');
  }
  if (!(process.env.JWT_SECRET || '').trim()) problems.push('JWT_SECRET is not set.');
  const platformAuthProblem = platformAuthEnvProblem();
  if (platformAuthProblem) problems.push(platformAuthProblem);
  return problems;
};

module.exports = { createApp, startupEnvProblems };
