/**
 * PlatformUser — LogiForce staff who operate the platform (not tenant users).
 * Collection: 'platform_users' (platform DB only).
 *
 * Password hashing matches the tenant User model: bcryptjs, 12 salt rounds.
 * A user can be created without a password and invited by email
 * (createInvitedPlatformUser + sendPlatformSetPasswordLink).
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
    // null for an invited user who hasn't used their set-password link yet:
    // such a user can't sign in (platformAuth compares against a dummy hash).
    passwordHash: {
      type: String,
      default: null,
      select: false,
    },
    // Set-password link (services/platformUser.service.js). Only the sha256 of
    // the emailed token is stored.
    passwordSetTokenHash: { type: String, default: null, select: false },
    passwordSetExpires: { type: Date, default: null, select: false },
    // PlatformRole.key. What the user may do comes only from that role's
    // permissions (protectPlatform loads it on every request).
    roleKey: {
      type: String,
      required: [true, 'Role is required'],
      lowercase: true,
      trim: true,
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    // The platform user who invited this one; null for the bootstrap Owner.
    invitedBy: {
      type: Schema.Types.ObjectId,
      ref: 'PlatformUser',
      default: null,
    },
    lastLoginAt: Date,
    // Copied into every platform JWT as `tv`. protectPlatform rejects a token
    // whose tv differs, so incrementing this (password reset) signs out every
    // existing session.
    tokenVersion: { type: Number, default: 0 },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (doc, ret) => {
        delete ret.passwordHash;
        delete ret.passwordSetTokenHash;
        delete ret.passwordSetExpires;
        delete ret.__v;
        return ret;
      },
    },
  }
);

/** bcrypt hash of a platform password; throws if it is too short. */
const hashPlatformPassword = async (plain) => {
  if (typeof plain !== 'string' || plain.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  return bcrypt.hash(plain, SALT_ROUNDS);
};

platformUserSchema.methods.setPassword = async function (plain) {
  this.passwordHash = await hashPlatformPassword(plain);
};

/**
 * Requires the document to be loaded with .select('+passwordHash').
 */
platformUserSchema.methods.comparePassword = async function (plain) {
  if (this.passwordHash === undefined) {
    throw new Error("passwordHash is not loaded; query with .select('+passwordHash')");
  }
  if (!this.passwordHash) return false; // invited, no password set yet
  if (typeof plain !== 'string') return false;
  return bcrypt.compare(plain, this.passwordHash);
};

module.exports = {
  schema: platformUserSchema,
  MIN_PASSWORD_LENGTH,
  hashPlatformPassword,
};
