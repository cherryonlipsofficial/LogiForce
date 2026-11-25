/**
 * Tenant — one company using LogiForce. Collection: 'tenants' (platform DB only).
 *
 * Exports the schema only. Register it on the platform connection through
 * platform/models/index.js; never with mongoose.model().
 */
const { Schema } = require('mongoose');
const { MODULES } = require('../../config/permissions');
const { getPlatformDbName, DEFAULT_PLATFORM_DB_NAME } = require('../db');

// Subdomains that can never be a tenant key.
const RESERVED_TENANT_KEYS = Object.freeze([
  'www', 'api', 'app', 'admin', 'platform', 'mail',
  'static', 'cdn', 'status', 'help', 'support', 'docs',
]);

// MongoDB's own system databases.
const RESERVED_DB_NAMES = Object.freeze(['admin', 'local', 'config']);

const TENANT_STATUSES = Object.freeze(['provisioning', 'active', 'suspended']);

const dedupe = (values) => [...new Set(values)];

const isReservedDbName = (name) =>
  RESERVED_DB_NAMES.includes(name)
  || name === getPlatformDbName()
  || name === DEFAULT_PLATFORM_DB_NAME;

const tenantSchema = new Schema(
  {
    // Subdomain, e.g. 'clienta' for clienta.logiforce.app
    key: {
      type: String,
      required: [true, 'Tenant key is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [
        /^[a-z][a-z0-9-]{2,30}$/,
        'Tenant key must be 3–31 characters: a lowercase letter, then lowercase letters, digits or hyphens',
      ],
      validate: {
        validator: (v) => !RESERVED_TENANT_KEYS.includes(v),
        message: (props) => `"${props.value}" is a reserved tenant key`,
      },
    },
    name: {
      type: String,
      required: [true, 'Tenant name is required'],
      trim: true,
    },
    // Defaults to 'logiforce_' + key (hyphens → underscores) when empty; see pre('validate').
    dbName: {
      type: String,
      required: [true, 'Database name is required'],
      unique: true,
      trim: true,
      match: [
        /^[a-z][a-z0-9_]{2,60}$/,
        'Database name must be 3–61 characters: a lowercase letter, then lowercase letters, digits or underscores',
      ],
      validate: {
        validator: (v) => !isReservedDbName(v),
        message: (props) => `"${props.value}" is a reserved database name`,
      },
    },
    // The NAME of an env var that holds this tenant's MongoDB URI. Never a URI.
    dbUriEnv: {
      type: String,
      default: null,
      match: [/^[A-Z][A-Z0-9_]*$/, 'dbUriEnv must be an environment variable name (e.g. MONGODB_URI_CLIENTA), not a URI'],
    },
    status: {
      type: String,
      enum: TENANT_STATUSES,
      default: 'provisioning',
      index: true,
    },
    enabledModules: {
      type: [String],
      validate: {
        validator: (values) => values.every((m) => MODULES.includes(m)),
        message: (props) => {
          const bad = (props.value || []).filter((m) => !MODULES.includes(m));
          return `Unknown module(s) in enabledModules: ${bad.join(', ')}`;
        },
      },
    },
    // RoleTemplate keys offered to this tenant. Shape only for now.
    roleTemplateKeys: {
      type: [String],
    },
    limits: {
      // null = unlimited
      maxUsers: { type: Number, min: 1, default: null },
    },
    allowSelfSignup: {
      type: Boolean,
      default: false,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'PlatformUser',
      default: null,
    },
  },
  { timestamps: true }
);

tenantSchema.pre('validate', function () {
  if (!this.dbName && this.key) {
    this.dbName = `logiforce_${this.key.replace(/-/g, '_')}`;
  }

  for (const path of ['enabledModules', 'roleTemplateKeys']) {
    const values = this.get(path) || [];
    const unique = dedupe(values);
    if (unique.length !== values.length) this.set(path, unique);
  }
});

module.exports = {
  schema: tenantSchema,
  RESERVED_TENANT_KEYS,
  RESERVED_DB_NAMES,
  TENANT_STATUSES,
};
