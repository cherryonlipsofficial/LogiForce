const mongoose = require('mongoose');

const ensureAdminRole = async () => {
  const Role = require('../models/Role');
  const User = require('../models/User');
  const { PERMISSIONS } = require('./permissions');
  const allKeys = Object.keys(PERMISSIONS);

  const adminRole = await Role.findOneAndUpdate(
    { name: 'admin' },
    {
      $set: {
        isSystemRole: true,
        displayName: 'Administrator',
        permissions: allKeys,
      },
      $setOnInsert: {
        name: 'admin',
        description: 'Full access to all modules',
      },
    },
    { upsert: true, new: true }
  );

  // Fix any admin users whose roleId is missing or points to a stale ObjectId
  await User.updateMany(
    {
      email: 'admin@logiforce.com',
      $or: [{ roleId: null }, { roleId: { $exists: false } }],
    },
    { $set: { roleId: adminRole._id } }
  );
};

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI);
    console.log(`MongoDB connected: ${conn.connection.host}`);
    await ensureAdminRole();
  } catch (error) {
    console.error(`MongoDB connection error: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
