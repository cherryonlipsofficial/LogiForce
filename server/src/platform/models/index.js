/**
 * Platform model registry.
 *
 * These models live ONLY on the platform connection (platform/db.js), with
 * pinned collection names. They must never be registered with mongoose.model()
 * or added to the tenant registry (config/modelRegistry.js): either would let
 * them be written into a tenant database.
 */
const { getPlatformConnection } = require('../db');

const PLATFORM_MODELS = Object.freeze([
  { name: 'Tenant', schema: require('./Tenant').schema, collection: 'tenants' },
  { name: 'RoleTemplate', schema: require('./RoleTemplate').schema, collection: 'role_templates' },
  { name: 'PlatformUser', schema: require('./PlatformUser').schema, collection: 'platform_users' },
  { name: 'PlatformRole', schema: require('./PlatformRole').schema, collection: 'platform_roles' },
  { name: 'PlatformAuditLog', schema: require('./PlatformAuditLog').schema, collection: 'platform_audit_logs' },
  {
    name: 'PlatformLoginChallenge',
    schema: require('./PlatformLoginChallenge').schema,
    collection: 'platform_login_challenges',
  },
]);

/**
 * @returns {{ Tenant: import('mongoose').Model, RoleTemplate: import('mongoose').Model,
 *             PlatformUser: import('mongoose').Model, PlatformRole: import('mongoose').Model,
 *             PlatformAuditLog: import('mongoose').Model,
 *             PlatformLoginChallenge: import('mongoose').Model }}
 * Throws if the platform DB isn't connected yet (call connectPlatformDb() first).
 */
const getPlatformModels = () => {
  const conn = getPlatformConnection();
  const models = {};
  // Register them all together so refs between them (e.g. createdBy → PlatformUser) resolve.
  for (const { name, schema, collection } of PLATFORM_MODELS) {
    models[name] = conn.models[name] || conn.model(name, schema, collection);
  }
  return models;
};

module.exports = { getPlatformModels, PLATFORM_MODELS };
