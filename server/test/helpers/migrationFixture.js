/**
 * Made-up companies for test/migrateToPlatform.test.js (and a demo dry run).
 * Not real data.
 */
const mongoose = require('mongoose');
const { makeModel, clone } = require('./fakeDb');
const { PERMISSIONS, MODULES } = require('../../src/config/permissions');
const { ROLE_TEMPLATES } = require('../../src/config/defaultRoles');

const ALL_KEYS = Object.keys(PERMISSIONS);
const oid = () => new mongoose.Types.ObjectId();
const role = (name, extra = {}) => ({
  _id: oid(), name, displayName: name, permissions: ['drivers.view'], isSystemRole: false, isActive: true, ...extra,
});
const adminRole = () => role('admin', { displayName: 'Administrator', isSystemRole: true, permissions: ALL_KEYS });

/**
 * The world the scenario starts from: three registered companies (alpha is the
 * template source) and one still provisioning, which is left alone.
 */
const buildWorld = () => {
  const templates = [
    ...ROLE_TEMPLATES.map((t) => ({ _id: oid(), ...clone({ ...t, permissions: [...t.permissions] }), version: 1 })),
    // the old seed also stored the all-permissions admin as a template
    { _id: oid(), key: 'admin', displayName: 'Administrator', permissions: ['drivers.view'], assignableByTenant: false, version: 1 },
  ];
  const allTemplateKeys = templates.map((t) => t.key);

  const tenants = [
    { _id: oid(), key: 'alpha', name: 'Alpha Freight', dbName: 'alpha_db', status: 'active', enabledModules: [...MODULES], roleTemplateKeys: [...allTemplateKeys] },
    { _id: oid(), key: 'beta', name: 'Beta Transport', dbName: 'logiforce_beta', status: 'active', enabledModules: [...MODULES], roleTemplateKeys: [...allTemplateKeys] },
    { _id: oid(), key: 'gamma', name: 'Gamma Logistics', dbName: 'logiforce_gamma', status: 'suspended', enabledModules: [...MODULES], roleTemplateKeys: [] },
    { _id: oid(), key: 'delta', name: 'Delta Co', dbName: 'logiforce_delta', status: 'provisioning', enabledModules: [], roleTemplateKeys: ['tenant_admin'] },
  ];

  const alphaAdmin = adminRole();
  const alpha = {
    roles: [
      alphaAdmin,
      role('accountant'),
      role('Ops Lead', { templateKey: 'ops', managedBy: 'platform' }), // linked by an earlier sync, different name
      role(' Sales  '),
      role('Dispatcher', { permissions: ['drivers.view', 'roles.manage', 'old.unknown_key'] }),
      role('Night Shift', { permissions: ['attendance.view'] }),
    ],
    users: [],
  };
  alpha.users = [
    ...[1, 2, 3].map((i) => ({ _id: oid(), email: `admin${i}@alpha.test`, roleId: alphaAdmin._id })),
    { _id: oid(), email: 'd1@alpha.test', roleId: alpha.roles[4]._id },
    { _id: oid(), email: 'd2@alpha.test', roleId: alpha.roles[4]._id },
  ];

  const betaAdmin = adminRole();
  const beta = {
    roles: [
      betaAdmin,
      role('tenant_admin', { templateKey: 'tenant_admin', managedBy: 'platform' }), // from an earlier role sync, unused
      role('OPS'),
      role('Night  shift'),           // matches the new night_shift template? no: names differ (space vs _)
      role('Fleet Supervisor', { permissions: ['vehicles.view', 'vehicles.assign'] }),
      role('Viewer'),
      role('viewer '),                // two roles match "viewer": ambiguous
    ],
    users: [],
  };
  beta.users = [{ _id: oid(), email: 'a@beta.test', roleId: betaAdmin._id }, { _id: oid(), email: 'f@beta.test', roleId: beta.roles[4]._id }];

  const gammaAdmin = adminRole();
  const gammaTenantAdmin = role('tenant_admin', { templateKey: 'tenant_admin', managedBy: 'platform' });
  const gamma = {
    roles: [gammaAdmin, gammaTenantAdmin, role('sales')],
    users: [{ _id: oid(), email: 'x@gamma.test', roleId: gammaTenantAdmin._id }], // the leftover tenant_admin is in use
  };

  return { templates, tenants, companies: { alpha_db: alpha, logiforce_beta: beta, logiforce_gamma: gamma } };
};

const makeDeps = (world, overrides = {}) => {
  const models = {
    RoleTemplate: makeModel(world.templates, { unique: ['key'] }),
    Tenant: makeModel(world.tenants, { unique: ['key', 'dbName'] }),
    PlatformAuditLog: { entries: [], record: async (e) => { models.PlatformAuditLog.entries.push(clone(e)); } },
  };
  const companyModels = new Map(Object.entries(world.companies).map(([dbName, c]) => [dbName, {
    Role: makeModel(c.roles, { unique: ['name'] }),
    User: makeModel(c.users),
  }]));
  const deps = {
    models,
    companyModels,
    platformDbName: 'logiforce_platform',
    redact: (m) => String(m),
    openCompany: async (record) => {
      const c = companyModels.get(record.dbName);
      if (!c) throw new Error(`cannot reach database ${record.dbName}`);
      return { ...c, close: async () => {} };
    },
    ...overrides,
  };
  return deps;
};

module.exports = { buildWorld, makeDeps, role, adminRole, oid, ALL_KEYS };
