/**
 * PlatformRole — a set of platform permissions given to platform users.
 * Collection: 'platform_roles' (platform DB only).
 *
 * Holds platform keys only (config/platformPermissions.js); a company
 * permission can never be stored here. The locked platform_owner role is
 * resolved from code (platformRolePermissions), so its stored list is only a
 * copy for people reading the database.
 *
 * Exports the schema only. Register it on the platform connection through
 * platform/models/index.js; never with mongoose.model().
 */
const { Schema } = require('mongoose');
const { isPlatformPermissionKey } = require('../../config/platformPermissions');

const PLATFORM_ROLE_KEY_PATTERN = /^[a-z][a-z0-9_]{1,40}$/;

const platformRoleSchema = new Schema(
  {
    key: {
      type: String,
      required: [true, 'Role key is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [
        PLATFORM_ROLE_KEY_PATTERN,
        'Role key must be 2–41 characters: a lowercase letter, then lowercase letters, digits or underscores',
      ],
    },
    displayName: {
      type: String,
      required: [true, 'Display name is required'],
      trim: true,
    },
    description: { type: String, default: '' },
    permissions: {
      type: [String],
      validate: {
        validator: (values) => values.every(isPlatformPermissionKey),
        message: (props) => {
          const bad = (props.value || []).filter((p) => !isPlatformPermissionKey(p));
          return `Not platform permission(s): ${bad.join(', ')}`;
        },
      },
    },
    isSystem: { type: Boolean, default: false },
    createdBy: { type: Schema.Types.ObjectId, ref: 'PlatformUser', default: null },
  },
  { timestamps: true }
);

platformRoleSchema.pre('validate', function () {
  const values = this.permissions || [];
  const unique = [...new Set(values)];
  if (unique.length !== values.length) this.permissions = unique;
});

module.exports = { schema: platformRoleSchema, PLATFORM_ROLE_KEY_PATTERN };
