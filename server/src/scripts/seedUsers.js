require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

const users = [
  {
    name: 'Admin User',
    email: 'admin@logiforce.com',
    password: 'admin123',
    role: 'admin',
    isActive: true,
  },
  {
    name: 'Accountant User',
    email: 'accountant@logiforce.com',
    password: 'accountant123',
    role: 'accountant',
    isActive: true,
  },
  {
    name: 'Ops User',
    email: 'ops@logiforce.com',
    password: 'ops123',
    role: 'ops',
    isActive: true,
  },
  {
    name: 'Compliance User',
    email: 'compliance@logiforce.com',
    password: 'compliance123',
    role: 'compliance',
    isActive: true,
  },
  {
    name: 'Sales User',
    email: 'sales@logiforce.com',
    password: 'sales123',
    role: 'sales',
    isActive: true,
  },
];

const seed = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB connected');

    await User.deleteMany({});
    console.log('Cleared existing users');

    const created = await User.create(users);
    console.log(`Seeded ${created.length} users:`);
    created.forEach((u) => {
      console.log(`  - ${u.email} (${u.role})`);
    });

    await mongoose.disconnect();
    console.log('Done');
    process.exit(0);
  } catch (error) {
    console.error('Seed error:', error.message);
    process.exit(1);
  }
};

seed();
