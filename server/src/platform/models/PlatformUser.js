/**
 * PlatformUser — LogiForce staff who operate the platform (not tenant users).
 * Collection: 'platform_users' (platform DB only).
 *
 * Password hashing matches the tenant User model: bcryptjs, 12 salt rounds.
 *
 * Exports the schema only. Register it on the platform connection through
 * platform/models/index.js; never with mongoose.model().
 */
const { Schema } = require('mongoose');
const bcrypt = require('bcryptjs');

const SALT_ROUNDS = 12; // same as modules/shared/User.js
const MIN_PASSWORD_LENGTH = 12;

const platformUserSchema = new Schema(
  {
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Email address is not valid'],
    },
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
    },
    passwordHash: {
      type: String,
      required: [true, 'Password is required'],
      select: false,
    },
    role: {
      type: String,
      enum: ['owner', 'support'],
      default: 'support',
    },
    status: {
      type: String,
      enum: ['active', 'disabled'],
      default: 'active',
    },
    lastLoginAt: Date,
  },
  {
    timestamps: true,
    toJSON: {
      transform: (doc, ret) => {
        delete ret.passwordHash;
        delete ret.__v;
        return ret;
      },
    },
  }
);

platformUserSchema.methods.setPassword = async function (plain) {
  if (typeof plain !== 'string' || plain.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  this.passwordHash = await bcrypt.hash(plain, SALT_ROUNDS);
};

/**
 * Requires the document to be loaded with .select('+passwordHash').
 */
platformUserSchema.methods.comparePassword = async function (plain) {
  if (!this.passwordHash) {
    throw new Error("passwordHash is not loaded; query with .select('+passwordHash')");
  }
  if (typeof plain !== 'string') return false;
  return bcrypt.compare(plain, this.passwordHash);
};

module.exports = {
  schema: platformUserSchema,
  MIN_PASSWORD_LENGTH,
};
