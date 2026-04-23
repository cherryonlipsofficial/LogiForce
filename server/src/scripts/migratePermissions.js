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
      'invoices.download',
      'salary.view', 'salary.run',
      'salary.adjust', 'salary.export_wps',
      'advances.view', 'advances.approve', 'advances.manage_recovery',
      'notifications.view',
    ],
    sales: [
      'attendance.view', 'attendance.dispute',
      'invoices.view', 'invoices.download',
      'salary.view', 'advances.view', 'advances.request',
      'notifications.view',
    ],
    ops: [
      'attendance.view', 'attendance.dispute',
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

  // Remove old permission keys that were renamed or deprecated
  const removals = ['advances.issue', 'advances.recover', 'attendance.approve'];

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

  // Drop deprecated keys from ALL roles (including custom ones)
  const deprecatedKeys = ['attendance.approve'];
  for (const key of deprecatedKeys) {
    const result = await db.collection('roles').updateMany(
      { permissions: key },
      { $pull: { permissions: key } }
    );
    if (result.modifiedCount > 0) {
      console.log(`Removed deprecated ${key} from ${result.modifiedCount} role(s)`);
    }
  }

  // Migrate legacy keys in ALL roles (including custom ones)
  const { LEGACY_KEY_MAP } = require('../config/permissions');
  for (const [oldKey, newKey] of Object.entries(LEGACY_KEY_MAP)) {
    const result = await db.collection('roles').updateMany(
      { permissions: oldKey },
      [{ $set: { permissions: {
        $setUnion: [
          { $filter: { input: '$permissions', cond: { $ne: ['$$this', oldKey] } } },
          [newKey]
        ]
      }}}]
    );
    if (result.modifiedCount > 0) {
      console.log(`Migrated ${result.modifiedCount} role(s): ${oldKey} → ${newKey}`);
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
