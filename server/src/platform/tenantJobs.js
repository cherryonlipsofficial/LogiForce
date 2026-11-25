/**
 * Jobs that run once per company (scheduled from server.js).
 *
 * The company list comes from the platform database (listActiveTenants), so
 * suspended and provisioning companies are skipped. A failure for one company
 * is logged and the job moves on to the next one; nothing here throws.
 */
const logger = require('../utils/logger');
const { listActiveTenants, redactUris } = require('../config/tenants');
const { getConnectionForTenant } = require('../config/connectionManager');

/**
 * Run `fn(tenantConfig)` for every active company, one at a time.
 *
 * @param {string} jobName  used in the log lines
 * @param {(tenantConfig: object) => Promise<void>} fn
 * @param {{ logPrefix?: string }} [options]
 * @returns {Promise<{ loaded: boolean, done: string[], failed: string[] }>} never rejects
 */
const forEachActiveTenant = async (jobName, fn, { logPrefix = '[Cron]' } = {}) => {
  const summary = { loaded: false, done: [], failed: [] };

  let tenants;
  try {
    tenants = await listActiveTenants();
  } catch (err) {
    logger.error(`${logPrefix} ${jobName}: could not load tenants: ${redactUris(err?.message)}`);
    return summary;
  }
  summary.loaded = true;

  for (const tenantConfig of tenants) {
    try {
      await fn(tenantConfig);
      summary.done.push(tenantConfig.key);
      logger.info(`${logPrefix} ${jobName} done for ${tenantConfig.key}`);
    } catch (err) {
      summary.failed.push(tenantConfig.key);
      logger.error(`${logPrefix} ${jobName} failed for ${tenantConfig.key}: ${redactUris(err?.message)}`,
        { stack: redactUris(err?.stack) });
    }
  }
  return summary;
};

// ── The jobs ──
// Bodies are unchanged from server.js; only the company list moved to the platform DB.

// Clean up orphaned ledger entries on startup (all companies)
const runStartupLedgerCleanup = () => forEachActiveTenant('Ledger cleanup', async (tenantConfig) => {
  const { cleanupOrphanedLedgerEntries } = require('../utils/ledgerCleanup');
  const conn = await getConnectionForTenant(tenantConfig);
  await cleanupOrphanedLedgerEntries(conn);
}, { logPrefix: '[Startup]' });

// Nightly guarantee passport expiry check
const runExpiryCheck = () => {
  logger.info('Running guarantee passport expiry check...');
  return forEachActiveTenant('Expiry check', async (tenantConfig) => {
    await getConnectionForTenant(tenantConfig);
    // TODO: refactor runExpiryCheck to accept connection
  });
};

// Daily ledger cleanup — remove orphaned entries from manual DB deletions
const runLedgerCleanup = () => {
  logger.info('Running daily ledger cleanup...');
  return forEachActiveTenant('Ledger cleanup', async (tenantConfig) => {
    const { cleanupOrphanedLedgerEntries } = require('../utils/ledgerCleanup');
    const conn = await getConnectionForTenant(tenantConfig);
    const result = await cleanupOrphanedLedgerEntries(conn);
    logger.info(`[Cron] Ledger cleanup for ${tenantConfig.key}: ${result.hardDeleted} removed, ${result.softDeleted} soft-deleted`);
  });
};

// Daily salary approval reminder
const runSalaryReminder = () => {
  logger.info('Running salary approval reminder check...');
  return forEachActiveTenant('Salary reminder check', async (tenantConfig) => {
    const { notifyAccountsBeforeSalaryDate } = require('../modules/payroll/salaryReminder.service');
    const conn = await getConnectionForTenant(tenantConfig);
    // Notify Accounts users 3 days before each project's salary release date
    const result = await notifyAccountsBeforeSalaryDate({ dbConnection: conn }, { daysBefore: 3 });
    logger.info(`[Cron] Salary reminder check for ${tenantConfig.key}: ${result.notificationsSent} notification(s) sent`);
  });
};

module.exports = {
  forEachActiveTenant,
  runStartupLedgerCleanup,
  runExpiryCheck,
  runLedgerCleanup,
  runSalaryReminder,
};
