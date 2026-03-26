/**
 * One-time migration check: identifies drivers with a clientId but no projectId.
 * Informational only — does not auto-assign projects.
 * Run via: npm run migrate:projects
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const { Driver } = require('../models');

async function main() {
  await connectDB();

  const drivers = await Driver.find({
    clientId: { $ne: null },
    $or: [{ projectId: null }, { projectId: { $exists: false } }],
  }).select('_id name employeeId clientId');

  if (drivers.length === 0) {
    console.log('All drivers with a client already have a project assignment.');
  } else {
    console.warn(
      `WARNING: ${drivers.length} driver(s) have a clientId but no projectId.`
    );
    console.warn('These must be assigned to a project manually by the ops team:');
    drivers.forEach((d) => {
      console.warn(
        `  - ${d.name || d.employeeId || d._id} (clientId: ${d.clientId})`
      );
    });
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Migration check failed:', err);
  process.exit(1);
});
