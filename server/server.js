require('dotenv').config();

const logger = require('./src/utils/logger');
const { createApp, startupEnvProblems } = require('./src/app');
const { closeAllConnections } = require('./src/config/connectionManager');
const { connectPlatformDb, closePlatformDb } = require('./src/platform/db');
const {
  runStartupLedgerCleanup,
  runExpiryCheck,
  runLedgerCleanup,
  runSalaryReminder,
} = require('./src/platform/tenantJobs');

// Refuse to start with a missing or unsafe configuration. The messages never
// contain a secret.
const problems = startupEnvProblems();
if (problems.length) {
  for (const problem of problems) console.error(`[FATAL] ${problem}`);
  console.error('[FATAL] See server/.env.example.');
  process.exit(1);
}

// Nothing here creates companies, users, roles or business data. A fresh
// install has zero companies; the Platform Owner creates them in the console.
const app = createApp();

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

  // Per-company jobs (src/platform/tenantJobs.js). Each run reads the active
  // companies from the platform DB, so a new company is picked up without a
  // restart and suspended or archived ones are skipped.

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

  try {
    await closeAllConnections();
    logger.info('All tenant connections closed');
  } catch (err) {
    logger.error('Error closing tenant connections', { error: err.message });
  }

  try {
    await closePlatformDb();
    logger.info('Platform DB connection closed');
  } catch (err) {
    logger.error('Error closing platform DB', { error: err.message });
  }

  process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle unhandled rejections
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Rejection', { reason: String(reason) });
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception', { error: err.message, stack: err.stack });
  process.exit(1);
});
