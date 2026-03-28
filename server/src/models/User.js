const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

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
    preferences: {
      initialsColor: {
        type: String,
        enum: ['blue', 'teal', 'purple', 'amber', 'coral', 'pink'],
        default: 'blue',
      },
    },
  },
  {
    timestamps: true,
  }
);

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = async function (plaintext) {
  return bcrypt.compare(plaintext, this.password);
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

module.exports = mongoose.model('User', userSchema);
