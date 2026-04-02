const logger = require('./logger');
const { getModel, getModelForConnection } = require('../config/modelRegistry');

/**
 * Clean up orphaned DriverLedger entries whose referenced SalaryRun
 * has been manually deleted from the database (hard delete) or soft-deleted.
 *
 * - Ledger entries with a salaryRunId pointing to a non-existent SalaryRun → hard delete
 * - Ledger entries with a salaryRunId pointing to a soft-deleted SalaryRun → mark isDeleted
 *
 * @param {Object} [reqOrConn] - Express request object OR a Mongoose connection (for cron jobs)
 */
const cleanupOrphanedLedgerEntries = async (reqOrConn) => {
  let DriverLedger, SalaryRun;

  if (reqOrConn && reqOrConn.tenantConnection) {
    // Called from a route handler — reqOrConn is req
    DriverLedger = getModel(reqOrConn, 'DriverLedger');
    SalaryRun = getModel(reqOrConn, 'SalaryRun');
  } else if (reqOrConn && typeof reqOrConn.model === 'function') {
    // Called from a cron job — reqOrConn is a Mongoose connection
    DriverLedger = getModelForConnection(reqOrConn, 'DriverLedger');
    SalaryRun = getModelForConnection(reqOrConn, 'SalaryRun');
  } else {
    // Fallback: use default mongoose connection (legacy / single-tenant)
    const mongoose = require('mongoose');
    DriverLedger = mongoose.model('DriverLedger');
    SalaryRun = mongoose.model('SalaryRun');
  }

  // 1. Find all distinct salaryRunIds referenced by non-deleted ledger entries
  const ledgerSalaryRunIds = await DriverLedger.distinct('salaryRunId', {
    salaryRunId: { $ne: null },
    isDeleted: { $ne: true },
  });

  if (!ledgerSalaryRunIds.length) {
    logger.info('Ledger cleanup: no ledger entries with salaryRunId to check');
    return { hardDeleted: 0, softDeleted: 0 };
  }

  // 2. Find which of those SalaryRuns still exist
  const existingRuns = await SalaryRun.find(
    { _id: { $in: ledgerSalaryRunIds } },
    { _id: 1, isDeleted: 1 }
  ).lean();

  const existingRunMap = new Map();
  for (const run of existingRuns) {
    existingRunMap.set(run._id.toString(), run);
  }

  // 3. Separate into: missing (hard-deleted from DB) and soft-deleted
  const missingRunIds = [];
  const softDeletedRunIds = [];

  for (const runId of ledgerSalaryRunIds) {
    if (!runId) continue;
    const key = runId.toString();
    const run = existingRunMap.get(key);
    if (!run) {
      missingRunIds.push(runId);
    } else if (run.isDeleted) {
      softDeletedRunIds.push(runId);
    }
  }

  let hardDeletedCount = 0;
  let softDeletedCount = 0;

  // 4. Hard-delete ledger entries for completely missing salary runs
  if (missingRunIds.length) {
    const result = await DriverLedger.deleteMany({
      salaryRunId: { $in: missingRunIds },
    });
    hardDeletedCount = result.deletedCount;
  }

  // 5. Soft-delete ledger entries for soft-deleted salary runs
  if (softDeletedRunIds.length) {
    const result = await DriverLedger.updateMany(
      { salaryRunId: { $in: softDeletedRunIds }, isDeleted: { $ne: true } },
      { $set: { isDeleted: true } }
    );
    softDeletedCount = result.modifiedCount;
  }

  if (hardDeletedCount || softDeletedCount) {
    logger.info(
      `Ledger cleanup: removed ${hardDeletedCount} orphaned entries, soft-deleted ${softDeletedCount} entries`
    );
  } else {
    logger.info('Ledger cleanup: no orphaned entries found');
  }

  return { hardDeleted: hardDeletedCount, softDeleted: softDeletedCount };
};

module.exports = { cleanupOrphanedLedgerEntries };
