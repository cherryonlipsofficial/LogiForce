const mongoose = require('mongoose');
const { hashPassword, comparePassword } = require('../../utils/password');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: 6,
      select: false,
    },
    roleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Role',
      required: true,
      index: true,
    },
    // User-level permission overrides on top of the role permissions
    permissionOverrides: [{
      key: { type: String },          // permission key
      granted: { type: Boolean },     // true = explicitly grant, false = explicitly deny
      reason: { type: String },       // admin note about why this override exists
      grantedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      grantedAt: { type: Date, default: Date.now },
    }],
    isActive: {
      type: Boolean,
      default: false,
      index: true,
    },
    activatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    activatedAt: {
      type: Date,
      default: null,
    },
    lastLogin: {
      type: Date,
    },
    loginCount: {
      type: Number,
      default: 0,
    },
    preferences: {
      initialsColor: {
        type: String,
        enum: ['blue', 'teal', 'purple', 'amber', 'coral', 'pink'],
        default: 'blue',
      },
    },
    passwordResetTokenHash: {
      type: String,
      select: false,
      default: null,
    },
    passwordResetExpires: {
      type: Date,
      select: false,
      default: null,
    },
    // Email OTP — used for self-service email verification, OTP-based password
    // reset, and OTP-based login. Stored hashed so a DB read can't replay the code.
    emailOtpHash: {
      type: String,
      select: false,
      default: null,
    },
    emailOtpPurpose: {
      type: String,
      enum: ['verify_email', 'login', 'password_reset', null],
      select: false,
      default: null,
    },
    emailOtpExpires: {
      type: Date,
      select: false,
      default: null,
    },
    emailOtpAttempts: {
      type: Number,
      select: false,
      default: 0,
    },
    emailVerifiedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await hashPassword(this.password);
  next();
});

userSchema.methods.comparePassword = async function (plaintext) {
  return comparePassword(plaintext, this.password);
};

userSchema.methods.getPermissions = async function () {
  await this.populate('roleId');
  const rolePerms = new Set(this.roleId?.permissions || []);

  // Apply overrides
  for (const override of this.permissionOverrides || []) {
    if (override.granted) {
      rolePerms.add(override.key);
    } else {
      rolePerms.delete(override.key);
    }
  }
  return [...rolePerms];
};

userSchema.methods.hasPermission = async function (permissionKey) {
  const perms = await this.getPermissions();
  return perms.includes(permissionKey);
};

userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

const User = mongoose.model('User', userSchema);
module.exports = User;
module.exports.schema = userSchema;
