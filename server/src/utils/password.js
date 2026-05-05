const bcrypt = require('bcryptjs');

const SALT_ROUNDS = 12;

const hashPassword = async (plaintext) => {
  if (typeof plaintext !== 'string' || plaintext.length === 0) {
    throw new Error('Password must be a non-empty string');
  }
  return bcrypt.hash(plaintext, SALT_ROUNDS);
};

const comparePassword = async (plaintext, hash) => {
  if (typeof plaintext !== 'string' || typeof hash !== 'string') return false;
  return bcrypt.compare(plaintext, hash);
};

module.exports = {
  SALT_ROUNDS,
  hashPassword,
  comparePassword,
};
