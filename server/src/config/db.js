const mongoose = require('mongoose');

const ensureAdminRole = async () => {
  const Role = require('../models/Role');
  const { PERMISSIONS } = require('./permissions');
  const allKeys = Object.keys(PERMISSIONS);

  await Role.findOneAndUpdate(
    { isSystemRole: true },
    {
      $set: {
        displayName: 'Administrator',
        permissions: allKeys,
      },
      $setOnInsert: {
        name: 'admin',
        isSystemRole: true,
        description: 'Full access to all modules',
      },
    },
    { upsert: true, new: true }
  );
};

const migrateAttendanceBatchIndexes = async () => {
  const db = mongoose.connection.db;
  const collection = db.collection('attendancebatches');

  // Drop the stale unique index that lacks the version field
  try {
    await collection.dropIndex('projectId_1_period.year_1_period.month_1');
    console.log('Dropped stale attendancebatches index (without version)');
  } catch {
    // Index already dropped or doesn't exist — nothing to do
  }

  // Backfill version=1 on any old documents missing it
  await collection.updateMany(
    { version: { $exists: false } },
    { $set: { version: 1 } }
  );

  // Let Mongoose create the correct index (with version) if missing
  const AttendanceBatch = require('../models/AttendanceBatch');
  await AttendanceBatch.syncIndexes();
};

const ensureRolePermissions = async () => {
  const Role = require('../models/Role');

  // Map of role names to permissions they must have for salary approval flow
  const REQUIRED_PERMS = {
    ops:              ['salary.approve_ops'],
    operations:       ['salary.approve_ops'],
    compliance:       ['salary.approve_compliance'],
    accounts:         ['salary.approve_accounts'],
    junior_accountant:['salary.approve_accounts'],
    accountant:       ['salary.approve_ops', 'salary.approve_compliance', 'salary.approve_accounts'],
  };

  for (const [roleName, expectedPerms] of Object.entries(REQUIRED_PERMS)) {
    const role = await Role.findOne({ name: roleName, isSystemRole: { $ne: true } });
    if (!role) continue;

    const current = new Set(role.permissions);
    const missing = expectedPerms.filter(p => !current.has(p));
    if (missing.length > 0) {
      role.permissions = [...new Set([...role.permissions, ...missing])];
      await role.save();
      console.log(`Role '${role.name}': added missing permissions ${missing.join(', ')}`);
    }
  }
};

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      tls: true,
      tlsAllowInvalidCertificates: false,
    });
    console.log(`MongoDB connected: ${conn.connection.host}`);
    await ensureAdminRole();
    await ensureRolePermissions();
    await migrateAttendanceBatchIndexes();
  } catch (error) {
    console.error(`MongoDB connection error: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
