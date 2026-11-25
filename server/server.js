require('dotenv').config();
require('express-async-errors');

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const mongoose = require('mongoose');
const rateLimit = require('express-rate-limit');
const connectDB = require('./src/config/db');
const errorHandler = require('./src/middleware/errorHandler');
const logger = require('./src/utils/logger');
const { resolveTenant } = require('./src/middleware/tenant');
const { closeAllConnections } = require('./src/config/connectionManager');
const { connectPlatformDb, closePlatformDb } = require('./src/platform/db');
const {
  runStartupLedgerCleanup,
  runExpiryCheck,
  runLedgerCleanup,
  runSalaryReminder,
} = require('./src/platform/tenantJobs');
const { platformAuthEnvProblem } = require('./src/platform/config');

// Platform (product-owner) login signs its tokens with PLATFORM_JWT_SECRET.
// Refuse to start without a usable one. The message never contains a secret.
const platformAuthProblem = platformAuthEnvProblem();
if (platformAuthProblem) {
  console.error(`[FATAL] ${platformAuthProblem}`);
  process.exit(1);
}

const app = express();

// Render (and the nginx in docker-compose) put exactly one proxy in front of
// the API. Trust that one hop so req.ip is the real client IP, which the rate
// limiters and audit logs rely on.
app.set('trust proxy', 1);

// Connect to MongoDB
connectDB();

// CORS — supports tenant subdomains and legacy origins
const allowedOrigins = [
  /\.logiforce\.app$/,           // all subdomains
  /localhost:\d+$/,              // local dev
];

// Add any legacy origins from CLIENT_URL env var
const legacyOrigins = (process.env.CLIENT_URL || 'https://logi-force.vercel.app')
  .split(',')
  .map(o => o.trim());

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true); // allow server-to-server
    const allowed = allowedOrigins.some(pattern =>
      pattern instanceof RegExp ? pattern.test(origin) : pattern === origin
    ) || legacyOrigins.includes(origin);
    callback(allowed ? null : new Error('CORS blocked'), allowed);
  },
  credentials: true,
}));

app.use(helmet());
app.disable('x-powered-by');

// Morgan logging
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
} else {
  // In production, use short format to stdout — Winston handles structured logging
  app.use(morgan('short'));
}

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Global API rate limiter — 200 requests per minute per IP
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests. Please try again shortly.' },
  skip: (req) => req.path === '/api/health',
});

app.use('/api', apiLimiter);

// Prevent caching on API responses
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
  next();
});

// Deep health check — ABOVE tenant middleware (no tenant required)
app.get('/api/health', async (req, res) => {
  const mongoState = mongoose.connection.readyState;
  // 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
  const isHealthy = mongoState === 1;

  const health = {
    status: isHealthy ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    mongodb: isHealthy ? 'connected' : 'disconnected',
  };

  res.status(isHealthy ? 200 : 503).json(health);
});

// Platform (product-owner) API — ABOVE tenant middleware. Its router ends with
// its own 404, so /api/platform/* never falls through to resolveTenant.
app.use('/api/platform', require('./src/platform/platform.routes')); // no tenant needed

// Tenant middleware: ALL /api routes below require a tenant
app.use('/api', resolveTenant);

// Audit middleware: logs every successful mutating request to AuditLog once the
// response is sent. Registered before the route handlers so its res.on('finish')
// hook runs after each route's protect middleware has populated req.user.
app.use('/api', require('./src/middleware/auditActivity'));

// Routes
app.use('/api/auth', require('./src/modules/shared/auth.routes'));
app.use('/api/drivers', require('./src/modules/drivers/drivers.routes'));
app.use('/api/clients', require('./src/modules/billing/clients.routes'));
app.use('/api/suppliers', require('./src/modules/billing/suppliers.routes'));
app.use('/api/attendance', require('./src/modules/attendance/attendance.routes'));
app.use('/api/invoices', require('./src/modules/billing/invoices.routes'));
app.use('/api/credit-notes', require('./src/modules/billing/creditNotes.routes'));
app.use('/api/reports', require('./src/modules/reports/reports.routes'));
app.use('/api/advances', require('./src/modules/payroll/advances.routes'));
app.use('/api/salary', require('./src/modules/payroll/salary.routes'));
app.use('/api/receivables', require('./src/modules/payroll/driverReceivables.routes'));
app.use('/api/vehicles', require('./src/modules/fleet/vehicles.routes'));
app.use('/api/vehicle-fines', require('./src/modules/fleet/vehicleFines.routes'));
app.use('/api/projects', require('./src/modules/billing/projects.routes'));
app.use('/api/roles', require('./src/modules/shared/roles.routes'));
app.use('/api/users', require('./src/modules/shared/users.routes'));
app.use('/api', require('./src/modules/compliance/guaranteePassport.routes'));
app.use('/api/notifications', require('./src/modules/shared/notifications.routes'));
app.use('/api/settings', require('./src/modules/shared/settings.routes'));
app.use('/api/simcards', require('./src/modules/telecom/simcards.routes'));
app.use('/api/driver-clearance', require('./src/modules/compliance/driverClearance.routes'));
app.use('/api/driver-visas', require('./src/modules/compliance/driverVisas.routes'));
app.use('/api/activity-log', require('./src/modules/shared/activityLog.routes'));

// Error handler
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
let server;

const start = async () => {
  // Platform (product-owner) DB must be reachable before we accept traffic.
  try {
    await connectPlatformDb();
  } catch (err) {
    logger.error(`Platform DB connection failed: ${err.message}`);
    process.exit(1);
  }

  server = app.listen(PORT, '0.0.0.0', onListening);
};

function onListening() {
  logger.info(`Server running on port ${PORT}`);

  // Per-company jobs (src/platform/tenantJobs.js). They run for active
  // companies only, read from the platform DB, which is connected by now.

  // Clean up orphaned ledger entries on startup
  runStartupLedgerCleanup();

  const cron = require('node-cron');

  // Nightly guarantee passport expiry check at 01:00 AM
  cron.schedule('0 1 * * *', runExpiryCheck);

  // Daily ledger cleanup at 02:00 AM — remove orphaned entries from manual DB deletions
  cron.schedule('0 2 * * *', runLedgerCleanup);

  // Daily salary approval reminder at 9:00 AM
  cron.schedule('0 9 * * *', runSalaryReminder);
}

start();

// Graceful shutdown
const gracefulShutdown = async (signal) => {
  logger.info(`${signal} received. Shutting down gracefully...`);

  // Stop accepting new connections (server is unset if we're still starting up)
  if (server) {
    server.close(() => {
      logger.info('HTTP server closed');
    });
  }

  // Close all tenant connections
  try {
    await closeAllConnections();
    logger.info('All tenant connections closed');
  } catch (err) {
    logger.error('Error closing tenant connections', { error: err.message });
  }

  // Close the platform DB connection
  try {
    await closePlatformDb();
    logger.info('Platform DB connection closed');
  } catch (err) {
    logger.error('Error closing platform DB', { error: err.message });
  }

  // Close default MongoDB connection
  try {
    await mongoose.connection.close();
    logger.info('MongoDB default connection closed');
  } catch (err) {
    logger.error('Error closing MongoDB', { error: err.message });
  }

  process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection', { reason: String(reason) });
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception', { error: err.message, stack: err.stack });
  process.exit(1);
});
