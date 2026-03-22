const jwt = require('jsonwebtoken');
const User = require('../models/User');

const generateToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
};

const login = async (email, password) => {
  const user = await User.findOne({ email, isActive: true }).select('+password');
  if (!user || !(await user.comparePassword(password))) {
    const err = new Error('Invalid email or password');
    err.statusCode = 401;
    throw err;
  }

  user.lastLogin = new Date();
  await user.save({ validateBeforeSave: false });

  const token = generateToken(user._id);
  return { token, user };
};

const register = async (userData) => {
  const user = await User.create(userData);
  const token = generateToken(user._id);
  return { token, user };
};

module.exports = { generateToken, login, register };
