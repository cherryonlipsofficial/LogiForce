/**
 * RoleTemplate — a role definition the platform offers to tenants.
 * Collection: 'role_templates' (platform DB only).
 *
 * `version` goes up by one every time `permissions` changes, so tenants can tell
 * their copy is stale. That only works through doc.save(): query updates
 * (updateOne, findOneAndUpdate, ...) that touch `permissions` are rejected below.
 *
 * Exports the schema only. Register it on the platform connection through
 * platform/models/index.js; never with mongoose.model().
 */
const { Schema } = require('mongoose');
const { PERMISSIONS } = require('../../config/permissions');

const isPermissionKey = (key) => Object.prototype.hasOwnProperty.call(PERMISSIONS, key);

const roleTemplateSchema = new Schema(
  {
    key: {
      type: String,
      required: [true, 'Role template key is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [
        /^[a-z][a-z0-9_]{1,40}$/,
        'Role template key must be 2–41 characters: a lowercase letter, then lowercase letters, digits or underscores',
      ],
    },
    displayName: {
      type: String,
      required: [true, 'Display name is required'],
      trim: true,
    },
    description: String,
    permissions: {
      type: [String],
      validate: {
        validator: (values) => values.every(isPermissionKey),
        message: (props) => {
          const bad = (props.value || []).filter((p) => !isPermissionKey(p));
          return `Unknown permission(s): ${bad.join(', ')}`;
        },
      },
    },
    assignableByTenant: {
      type: Boolean,
      default: true,
    },
    version: {
      type: Number,
      default: 1,
      min: 1,
    },
  },
  { timestamps: true }
);

roleTemplateSchema.pre('validate', function () {
  const values = this.permissions || [];
  const unique = [...new Set(values)];
  if (unique.length !== values.length) this.permissions = unique;
});

roleTemplateSchema.pre('save', function () {
  if (!this.isNew && this.isModified('permissions')) {
    this.version += 1;
  }
});

// ── Keep `version` honest: permission edits must go through doc.save() ──

const UPDATE_OPERATORS_TOUCHING_FIELDS = [
  '$set', '$unset', '$push', '$addToSet', '$pull', '$pullAll', '$pop', '$rename', '$setOnInsert',
];

const touchesPermissions = (update) => {
  if (!update || typeof update !== 'object') return false;
  const stages = Array.isArray(update) ? update : [update]; // aggregation-pipeline updates
  return stages.some((stage) => {
    if (!stage || typeof stage !== 'object') return false;
    const fieldMaps = [stage, ...UPDATE_OPERATORS_TOUCHING_FIELDS.map((op) => stage[op])];
    return fieldMaps.some((fields) =>
      fields && typeof fields === 'object'
      && Object.keys(fields).some((f) => f === 'permissions' || f.startsWith('permissions.')));
  });
};

roleTemplateSchema.pre(
  ['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'findOneAndReplace'],
  { query: true, document: false },
  function () {
    if (touchesPermissions(this.getUpdate())) {
      throw new Error('RoleTemplate permissions must be changed with doc.save() so the version increments');
    }
  }
);

module.exports = { schema: roleTemplateSchema };
