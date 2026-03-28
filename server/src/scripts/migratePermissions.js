require('dotenv').config();
const mongoose = require('mongoose');

async function migrate() {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;

  // New permissions per role to ADD (not replace — just add missing ones)
  const additions = {
    accountant: [
      'attendance.view', 'attendance.upload', 'attendance.respond_dispute',
      'invoices.view', 'invoices.generate', 'invoices.edit',
      'invoices.credit_note', 'invoices.download',
      'salary.view', 'salary.run', 'salary.approve',
      'salary.adjust', 'salary.export_wps',
      'advances.view', 'advances.approve', 'advances.manage_recovery',
      'notifications.view',
    ],
    sales: [
      'attendance.view', 'attendance.approve', 'attendance.dispute',
      'invoices.view', 'invoices.download',
      'salary.view', 'advances.view', 'advances.request',
      'notifications.view',
    ],
    ops: [
      'attendance.view', 'attendance.approve', 'attendance.dispute',
      'attendance.override', 'invoices.view', 'invoices.download',
      'salary.view', 'advances.view', 'advances.request',
      'notifications.view',
    ],
    compliance: [
      'attendance.view', 'salary.view',
      'advances.view', 'notifications.view',
    ],
    viewer: [
      'attendance.view', 'invoices.view', 'salary.view',
      'advances.view', 'notifications.view',
    ],
  };

  // Remove old permission keys that were renamed
  const removals = ['advances.issue', 'advances.recover'];

  for (const [roleName, newPerms] of Object.entries(additions)) {
    // First remove old keys, then add new ones
    if (removals.length > 0) {
      await db.collection('roles').updateOne(
        { name: roleName },
        { $pull: { permissions: { $in: removals } } }
      );
    }

    const result = await db.collection('roles').findOneAndUpdate(
      { name: roleName },
      { $addToSet: { permissions: { $each: newPerms } } },
      { returnDocument: 'after' }
    );
    if (result) {
      console.log(`${roleName}: permissions updated to ${result.permissions?.length} total`);
    } else {
      console.log(`${roleName}: role not found — skipping`);
    }
  }

  // Admin gets ALL permissions — update via getAllKeys
  const { PERMISSIONS } = require('../config/permissions');
  const allKeys = Object.keys(PERMISSIONS);
  const adminResult = await db.collection('roles').findOneAndUpdate(
    { name: 'admin', isSystemRole: true },
    { $set: { permissions: allKeys } },
    { returnDocument: 'after' }
  );
  if (adminResult) {
    console.log(`admin: all ${allKeys.length} permissions set`);
  }

  console.log('\nMigration complete.');
  await mongoose.disconnect();
  process.exit(0);
}

migrate().catch(e => { console.error(e.message); process.exit(1); });
