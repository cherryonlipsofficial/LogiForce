/**
 * Migration script: Migrates existing salary run statuses to the new multi-stage approval flow.
 *
 * - 'approved' → 'processed' (the old "approved" is equivalent to the new "processed")
 * - 'pending_approval' → 'draft' (reset to draft for re-approval through the new flow)
 *
 * Usage: node server/src/scripts/migrateSalaryStatuses.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');

async function migrate() {
  await connectDB();

  const SalaryRun = require('../models/SalaryRun');

  // Migrate 'approved' → 'processed'
  const approvedResult = await SalaryRun.updateMany(
    { status: 'approved' },
    { $set: { status: 'processed' } }
  );
  console.log(`Migrated ${approvedResult.modifiedCount} salary runs from 'approved' → 'processed'`);

  // Migrate 'pending_approval' → 'draft'
  const pendingResult = await SalaryRun.updateMany(
    { status: 'pending_approval' },
    { $set: { status: 'draft' } }
  );
  console.log(`Migrated ${pendingResult.modifiedCount} salary runs from 'pending_approval' → 'draft'`);

  console.log('Migration complete.');
  await mongoose.disconnect();
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
