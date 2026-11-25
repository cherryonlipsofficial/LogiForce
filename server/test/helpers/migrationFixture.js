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

/** The world the scenario starts from (what platform:seed + Phase 2 left behind). */
const buildWorld = () => {
  const templates = [
    ...ROLE_TEMPLATES.map((t) => ({ _id: oid(), ...clone({ ...t, permissions: [...t.permissions] }), version: 1 })),
    // the old seed also stored the all-permissions admin as a template
    { _id: oid(), key: 'admin', displayName: 'Administrator', permissions: ['drivers.view'], assignableByTenant: false, version: 1 },
  ];
  const allTemplateKeys = templates.map((t) => t.key);

  const tenants = [
    { _id: oid(), key: 'logi-force', name: 'LogiForce', dbName: 'logiforce', dbUriEnv: 'MONGODB_URI', status: 'active', enabledModules: [...MODULES], roleTemplateKeys: [...allTemplateKeys] },
    { _id: oid(), key: 'clienta', name: 'Client A Transport LLC', dbName: 'logiforce_clienta', dbUriEnv: 'MONGODB_URI_CLIENTA', status: 'active', enabledModules: [...MODULES], roleTemplateKeys: [...allTemplateKeys] },
  ];

  const lfAdmin = adminRole();
  const lf = {
    roles: [
      lfAdmin,
      role('accountant'),
      role('Ops Lead', { templateKey: 'ops', managedBy: 'platform' }), // linked by an earlier sync, different name
      role(' Sales  '),
      role('Dispatcher', { permissions: ['drivers.view', 'roles.manage', 'old.unknown_key'] }),
      role('Night Shift', { permissions: ['attendance.view'] }),
    ],
    users: [],
  };
  lf.users = [
    ...[1, 2, 3].map((i) => ({ _id: oid(), email: `admin${i}@lf.test`, roleId: lfAdmin._id })),
    { _id: oid(), email: 'd1@lf.test', roleId: lf.roles[4]._id },
    { _id: oid(), email: 'd2@lf.test', roleId: lf.roles[4]._id },
  ];

  const caAdmin = adminRole();
  const ca = {
    roles: [
      caAdmin,
      role('tenant_admin', { templateKey: 'tenant_admin', managedBy: 'platform' }), // from an earlier role sync, unused
      role('OPS'),
      role('Night  shift'),           // matches the new night_shift template? no: names differ (space vs _)
      role('Fleet Supervisor', { permissions: ['vehicles.view', 'vehicles.assign'] }),
      role('Viewer'),
      role('viewer '),                // two roles match "viewer": ambiguous
    ],
    users: [],
  };
  ca.users = [{ _id: oid(), email: 'a@ca.test', roleId: caAdmin._id }, { _id: oid(), email: 'f@ca.test', roleId: ca.roles[4]._id }];

  const cbAdmin = adminRole();
  const cbTenantAdmin = role('tenant_admin', { templateKey: 'tenant_admin', managedBy: 'platform' });
  const cb = {
    roles: [cbAdmin, cbTenantAdmin, role('sales')],
    users: [{ _id: oid(), email: 'x@cb.test', roleId: cbTenantAdmin._id }], // the leftover tenant_admin is in use
  };

  return { templates, tenants, companies: { logiforce: lf, logiforce_clienta: ca, logiforce_clientb: cb } };
};

const makeDeps = (world, overrides = {}) => {
  const models = {
    RoleTemplate: makeModel(world.templates, { unique: ['key'] }),
    Tenant: makeModel(world.tenants, { unique: ['key', 'dbName'] }),
    PlatformUser: makeModel(world.platformUsers || [], { unique: ['email'] }),
    PlatformAuditLog: { entries: [], record: async (e) => { models.PlatformAuditLog.entries.push(clone(e)); } },
  };
  const companyModels = new Map(Object.entries(world.companies).map(([dbName, c]) => [dbName, {
    Role: makeModel(c.roles, { unique: ['name'] }),
    User: makeModel(c.users),
  }]));
  const sent = [];
  const deps = {
    models,
    companyModels,
    sent,
    platformDbName: 'logiforce_platform',
    legacyTenants: {
      'logi-force': { name: 'LogiForce', dbName: 'logiforce_main' },
      clienta: { name: 'Client A Transport LLC', dbName: 'logiforce_clienta' },
      clientb: { name: 'Client B Logistics', dbName: 'logiforce_clientb' },
      clientc: { name: 'Client C Freight Co', dbName: 'logiforce_clientc' },
    },
    resolveLegacyTenant: (key) => ({
      clientb: { dbName: 'logiforce_clientb', dbUriEnv: 'MONGODB_URI_CLIENTB' },
    }[key] || { dbName: null, dbUriEnv: null }),
    newId: oid,
    redact: (m) => String(m),
    openCompany: async (record) => {
      const c = companyModels.get(record.dbName);
      if (!c) throw new Error(`cannot reach database ${record.dbName}`);
      return { ...c, close: async () => {} };
    },
    platformAccount: { email: 'owner@platform.test', name: 'Platform Owner' },
    platformUsers: {
      createInvited: async ({ email, name, role: r }) => models.PlatformUser.create({ email, name, role: r, passwordHash: null }),
      sendLink: async ({ userId }) => {
        const expiresAt = new Date(Date.now() + 86400000);
        await models.PlatformUser.updateOne({ _id: userId }, { $set: { passwordSetTokenHash: 'h', passwordSetExpires: expiresAt } });
        sent.push(String(userId));
        return { expiresAt };
      },
      consoleUrlProblem: () => null,
    },
    emailConfigured: () => true,
    ...overrides,
  };
  return deps;
};

module.exports = { buildWorld, makeDeps, role, adminRole, oid, ALL_KEYS };
