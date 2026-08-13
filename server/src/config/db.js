const mongoose = require('mongoose');
const logger = require('../utils/logger');

const ensureAdminRole = async () => {
  const Role = require('../modules/shared/Role');
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
    logger.info('Dropped stale attendancebatches index (without version)');
  } catch {
    // Index already dropped or doesn't exist — nothing to do
  }

  // Drop the previous unique index that didn't include batchType. The new
  // schema-defined index (with batchType) is created via syncIndexes below.
  try {
    await collection.dropIndex('projectId_1_period.year_1_period.month_1_version_1');
    logger.info('Dropped stale attendancebatches index (without batchType)');
  } catch {
    // Index already dropped or doesn't exist — nothing to do
  }

  // Backfill version=1 on any old documents missing it
  await collection.updateMany(
    { version: { $exists: false } },
    { $set: { version: 1 } }
  );

  // Backfill batchType=regular on any old documents missing it. Without this,
  // the new compound unique index would treat existing rows as having
  // batchType=null, blocking later inserts that reuse the same key.
  await collection.updateMany(
    { batchType: { $exists: false } },
    { $set: { batchType: 'regular' } }
  );

  // Let Mongoose create the correct index (with batchType) if missing
  const AttendanceBatch = require('../modules/attendance/AttendanceBatch');
  await AttendanceBatch.syncIndexes();
};

const ensureRolePermissions = async () => {
  const Role = require('../modules/shared/Role');

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
      logger.info(`Role '${role.name}': added missing permissions ${missing.join(', ')}`);
    }
  }
};

const connectDB = async () => {
  try {
    // Atlas URIs (mongodb+srv://) always speak TLS. Plain mongodb:// URIs —
    // e.g. the untls'd mongo:7 container in docker-compose — must not be
    // forced into a TLS handshake or the connection fails outright.
    const useTls = (process.env.MONGODB_URI || '').startsWith('mongodb+srv://');

    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      ...(useTls ? { tls: true, tlsAllowInvalidCertificates: false } : {}),
    });
    logger.info(`MongoDB connected: ${conn.connection.host}`);

    // Connection event handlers
    mongoose.connection.on('error', (err) => {
      logger.error('MongoDB connection error', { error: err.message });
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB disconnected. Attempting reconnect...');
    });

    mongoose.connection.on('reconnected', () => {
      logger.info('MongoDB reconnected');
    });

    await ensureAdminRole();
    await ensureRolePermissions();
    await migrateAttendanceBatchIndexes();
  } catch (error) {
    logger.error(`MongoDB connection error: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
