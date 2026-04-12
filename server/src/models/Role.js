const mongoose = require('mongoose');
const { Schema } = mongoose;

const roleSchema = new Schema({

  name: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    // e.g. 'admin', 'accountant', 'operations', 'hr_manager', 'viewer'
  },
  displayName: {
    type: String,
    required: true,
    // e.g. 'Administrator', 'Finance', 'Operations Manager'
  },
  description: { type: String },

  // The list of permission keys granted to this role
  // Each key must exist in config/permissions.js PERMISSIONS object
  permissions: [{
    type: String,
    validate: {
      validator: function(key) {
        const { PERMISSIONS } = require('../config/permissions');
        return key in PERMISSIONS;
      },
      message: props => `${props.value} is not a valid permission key`,
    },
  }],

  isSystemRole: {
    type: Boolean,
    default: false,
    // true for 'admin' — cannot be deleted, name cannot be changed
  },

  isActive: { type: Boolean, default: true },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },

}, { timestamps: true });

// Prevent deletion of system roles
roleSchema.pre('deleteOne', async function(next) {
  const doc = await this.model.findOne(this.getFilter());
  if (doc?.isSystemRole) {
    throw new Error('System roles cannot be deleted');
  }
  next();
});

const Role = mongoose.model('Role', roleSchema);
module.exports = Role;
module.exports.schema = roleSchema;
