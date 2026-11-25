/**
 * Platform role templates and the company role sync (Phase 2, Step 6).  npm test
 *
 * No MongoDB: the platform models and each company's Role/User collections are
 * replaced by small in-memory fakes that read lean (stored fields only, no
 * schema defaults), the way the service reads a real database. The real
 * planner, ceiling, template definitions and RoleTemplate schema are used.
 * The same scenarios still need a run against a real test company database.
 */
process.env.NODE_ENV = 'test';
process.env.MONGODB_BASE_URI = 'mongodb://tenant-db.invalid'; // only to build each company's URI; never opened

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const { PERMISSIONS, CORE_MODULES, isPlatformPermission, tenantCeiling } = require('../src/config/permissions');
const {
  defaultRoles, ROLE_TEMPLATES, RETIRED_TEMPLATE_KEYS, TENANT_ADMIN_CORE_PERMISSIONS, TENANT_ADMIN_BUSINESS_PERMISSIONS,
} = require('../src/config/defaultRoles');
const roleTemplateSchema = require('../src/platform/models/RoleTemplate').schema;
const tenantRoleSchema = require('../src/modules/shared/Role').schema;
const connectionManager = require('../src/config/connectionManager');
const platformModels = require('../src/platform/models');
const { syncTenantRoles, syncTenantsUsingTemplate, planRoleSync } = require('../src/platform/services/roleSync.service');

const ALL_KEYS = Object.keys(PERMISSIONS);
// Deep copy that keeps ObjectIds (structuredClone would turn them into plain objects).
const clone = (value) => {
  if (Array.isArray(value)) return value.map(clone);
  if (value instanceof mongoose.Types.ObjectId || value instanceof Date) return value;
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, clone(v)]));
  return value;
};
const keysIn = (module) => ALL_KEYS.filter((k) => PERMISSIONS[k].module === module && !isPlatformPermission(k));
const templateByKey = (key) => ROLE_TEMPLATES.find((t) => t.key === key);

// ── Templates ──

describe('role templates (config/defaultRoles.js)', () => {
  test('tenant_admin: Company Admin, not assignable by the company', () => {
    const t = templateByKey('tenant_admin');
    assert.ok(t);
    assert.equal(t.displayName, 'Company Admin');
    assert.equal(t.assignableByTenant, false);
  });

  test('tenant_admin = the 11 core permissions + every tenant-scope permission outside the core modules', () => {
    const t = templateByKey('tenant_admin');
    assert.deepEqual(TENANT_ADMIN_CORE_PERMISSIONS, [
      'users.view', 'users.create', 'users.edit', 'users.delete', 'users.manage_access',
      'roles.view', 'settings.view', 'settings.manage', 'activity_log.view',
      'notifications.view', 'dashboard.default',
    ]);
    const business = ALL_KEYS.filter((k) => !isPlatformPermission(k) && !CORE_MODULES.includes(PERMISSIONS[k].module));
    assert.deepEqual([...TENANT_ADMIN_BUSINESS_PERMISSIONS], business);
    assert.deepEqual(new Set(t.permissions), new Set([...TENANT_ADMIN_CORE_PERMISSIONS, ...business]));
    for (const k of ['drivers.force_status', 'guarantee_passports.approve_extension', 'attendance.approve_any',
      'users.manage_access', 'roles.view']) {
      assert.ok(t.permissions.includes(k), `missing ${k}`);
    }
    for (const k of ['roles.manage', 'dashboard.compliance', 'dashboard.sales']) {
      assert.ok(!t.permissions.includes(k), `should not have ${k}`);
    }
  });

  test('no template and no default role holds a platform permission', () => {
    for (const t of ROLE_TEMPLATES) {
      assert.deepEqual(t.permissions.filter(isPlatformPermission), [], `${t.key} holds a platform permission`);
    }
    for (const r of defaultRoles) {
      assert.deepEqual(r.permissions.filter(isPlatformPermission), [], `${r.name} holds a platform permission`);
    }
  });

  test('no all-permissions admin: not in defaultRoles, not a template, retired', () => {
    assert.deepEqual(defaultRoles.map((r) => r.name), ['accountant', 'ops', 'compliance', 'accounts', 'sales', 'viewer']);
    assert.ok(defaultRoles.every((r) => r.isSystemRole === false));
    assert.equal(templateByKey('admin'), undefined);
    assert.deepEqual([...RETIRED_TEMPLATE_KEYS], ['admin']);
    assert.deepEqual(ROLE_TEMPLATES.map((t) => t.key), [...defaultRoles.map((r) => r.name), 'tenant_admin']);
    assert.ok(ROLE_TEMPLATES.every((t) => t.key === 'tenant_admin' ? t.assignableByTenant === false : t.assignableByTenant));
  });
});

// ── RoleTemplate schema ──

describe('RoleTemplate validation', () => {
  const m = new mongoose.Mongoose();
  const RoleTemplate = m.model('RoleTemplate', roleTemplateSchema);

  test('rejects platform permissions and names them', async () => {
    const doc = new RoleTemplate({ key: 'bad_role', displayName: 'Bad', permissions: ['drivers.view', 'roles.manage'] });
    await assert.rejects(doc.validate(), (err) => {
      assert.match(err.errors.permissions.message, /Platform permission\(s\) cannot be in a role template: roles\.manage$/);
      return true;
    });
  });

  test('still rejects unknown permissions', async () => {
    const doc = new RoleTemplate({ key: 'bad_role', displayName: 'Bad', permissions: ['nope.nope'] });
    await assert.rejects(doc.validate(), /Unknown permission\(s\): nope\.nope/);
  });

  test('every ROLE_TEMPLATES entry is valid', async () => {
    for (const t of ROLE_TEMPLATES) {
      await new RoleTemplate({ ...t, permissions: [...t.permissions] }).validate();
    }
  });
});

describe('tenant Role schema', () => {
  test('new fields and defaults; name keeps its unique index', () => {
    const m = new mongoose.Mongoose();
    const Role = m.model('Role', tenantRoleSchema);
    const role = new Role({ name: 'x', displayName: 'X' });
    assert.equal(role.templateKey, null);
    assert.equal(role.managedBy, 'tenant');
    assert.equal(role.assignableByTenant, true);
    assert.equal(role.templateVersion, null);
    assert.deepEqual(tenantRoleSchema.path('managedBy').enumValues, ['platform', 'tenant']);
    const indexes = tenantRoleSchema.indexes().map(([fields, opts]) => [Object.keys(fields)[0], !!opts.unique]);
    assert.deepEqual(indexes.find(([f]) => f === 'name'), ['name', true]);
    assert.deepEqual(indexes.find(([f]) => f === 'templateKey'), ['templateKey', false]);
  });
});

// ── In-memory fakes ──

const idEq = (a, b) => String(a) === String(b);
const matchesValue = (actual, cond) => {
  if (cond && typeof cond === 'object' && !(cond instanceof mongoose.Types.ObjectId) && !Array.isArray(cond)) {
    if ('$ne' in cond) return !idEq(actual ?? null, cond.$ne ?? null); // a missing field is $ne anything non-null
    if ('$in' in cond) return cond.$in.some((v) => (Array.isArray(actual) ? actual.some((a) => idEq(a, v)) : idEq(actual, v)));
    if ('$nin' in cond) return !cond.$nin.some((v) => idEq(actual, v));
    throw new Error(`fake: unsupported operator ${Object.keys(cond)}`);
  }
  if (Array.isArray(actual)) return actual.some((a) => idEq(a, cond));
  return idEq(actual, cond);
};
const matches = (doc, filter) => Object.entries(filter).every(([k, cond]) => matchesValue(doc[k], cond));
const leanQuery = (fn) => ({
  lean: async () => clone(fn()),
  sort() { return this; },
});

const makeCompanyDb = (roles = [], users = []) => {
  const db = { roles: clone(roles), users: clone(users), writes: 0, failOnUpdateOf: null, closed: 0 };
  const Role = {
    init: async () => {},
    find: (filter = {}) => leanQuery(() => db.roles.filter((r) => matches(r, filter))),
    updateOne: async (filter, update, { upsert } = {}) => {
      const targetName = filter.name ?? db.roles.find((r) => filter._id && idEq(r._id, filter._id))?.name;
      if (db.failOnUpdateOf && targetName === db.failOnUpdateOf) throw new Error('simulated write failure');
      db.writes += 1;
      const doc = db.roles.find((r) => matches(r, filter));
      if (doc) {
        Object.assign(doc, clone(update.$set));
        return { matchedCount: 1, upsertedCount: 0 };
      }
      if (!upsert) return { matchedCount: 0 };
      if (db.roles.some((r) => r.name === filter.name)) throw new Error('E11000 duplicate key error: name');
      db.roles.push({
        _id: new mongoose.Types.ObjectId(), name: filter.name, ...clone(update.$setOnInsert), ...clone(update.$set),
      });
      return { matchedCount: 0, upsertedCount: 1 };
    },
    updateMany: async (filter, update) => {
      db.writes += 1;
      const docs = db.roles.filter((r) => matches(r, filter));
      for (const doc of docs) Object.assign(doc, clone(update.$set));
      return { modifiedCount: docs.length };
    },
  };
  const User = {
    countDocuments: async (filter) => db.users.filter((u) => matches(u, filter)).length,
  };
  db.conn = { models: { Role, User }, close: async () => { db.closed += 1; } };
  return db;
};

const platform = {
  templates: [],
  tenants: [],
  audit: [],
};
const companyDbs = new Map(); // dbName → fake db
const connectionCalls = [];

platformModels.getPlatformModels = () => ({
  RoleTemplate: { find: ({ key }) => leanQuery(() => platform.templates.filter((t) => key.$in.includes(t.key))) },
  Tenant: { find: (filter) => leanQuery(() => platform.tenants.filter((t) => matches(t, filter)).sort((a, b) => a.key.localeCompare(b.key))) },
  PlatformAuditLog: { record: async (entry) => { platform.audit.push(clone(entry)); } },
});
const connect = (kind) => async (tenantConfig) => {
  connectionCalls.push({ kind, dbName: tenantConfig.dbName });
  const db = companyDbs.get(tenantConfig.dbName);
  if (!db) throw new Error(`cannot reach database ${tenantConfig.dbName}`);
  return db.conn;
};
connectionManager.getConnectionForTenant = connect('cached');
connectionManager.openUncachedConnection = connect('uncached');

const seededTemplates = () => ROLE_TEMPLATES.map((t) => ({
  _id: new mongoose.Types.ObjectId(), ...clone({ ...t, permissions: [...t.permissions] }), version: 1,
}));

const makeTenant = (fields) => ({
  _id: new mongoose.Types.ObjectId(),
  dbUriEnv: null,
  status: 'active',
  enabledModules: [],
  roleTemplateKeys: [],
  ...fields,
  dbName: `logiforce_${fields.key.replace(/-/g, '_')}`,
});

// The all-permissions admin the old seed and ensureAdminRole wrote.
const OLD_ADMIN = {
  name: 'admin', displayName: 'Administrator', description: 'Full access to all modules', isSystemRole: true, permissions: ALL_KEYS,
};

// Roles as the old tenant seed left them: no managedBy / templateKey / ... stored.
const legacyRole = (name, extra = {}) => {
  const def = name === 'admin' ? OLD_ADMIN : defaultRoles.find((r) => r.name === name);
  return {
    _id: new mongoose.Types.ObjectId(), name, displayName: def.displayName, description: def.description,
    permissions: [...def.permissions], isSystemRole: def.isSystemRole, isActive: true, ...extra,
  };
};

const ACTOR = { userId: new mongoose.Types.ObjectId(), email: 'owner@example.invalid' };
const platformRoles = (db) => db.roles.filter((r) => r.managedBy === 'platform');
const roleNamed = (db, name) => db.roles.find((r) => r.name === name);

// ── Sync service ──

describe('syncTenantRoles', () => {
  let tenant;
  let db;
  let tenantOwned;

  beforeEach(() => {
    platform.templates = seededTemplates();
    platform.audit = [];
    platform.tenants = [];
    companyDbs.clear();
    connectionCalls.length = 0;

    tenant = makeTenant({ key: 'acme-test', enabledModules: ['Drivers'], roleTemplateKeys: ROLE_TEMPLATES.map((t) => t.key) });
    platform.tenants.push(tenant);

    const admin = legacyRole('admin');
    const ops = legacyRole('ops');
    const sales = legacyRole('sales');
    tenantOwned = [
      // A role the company made, stored with managedBy 'tenant'.
      { _id: new mongoose.Types.ObjectId(), name: 'dispatcher', displayName: 'Dispatcher', permissions: ['drivers.view', 'clients.view'], isSystemRole: false, isActive: true, managedBy: 'tenant', templateKey: null, assignableByTenant: true, templateVersion: null },
      // A custom role from before Phase 2 whose name is not a template key.
      { _id: new mongoose.Types.ObjectId(), name: 'night_shift', displayName: 'Night shift', permissions: ['attendance.view'], isSystemRole: false, isActive: true },
    ];
    db = makeCompanyDb(
      [admin, ops, sales, ...tenantOwned],
      [
        { _id: new mongoose.Types.ObjectId(), email: 'admin@acme.test', roleId: admin._id },
        { _id: new mongoose.Types.ObjectId(), email: 'ops@acme.test', roleId: ops._id },
        { _id: new mongoose.Types.ObjectId(), email: 'sales@acme.test', roleId: sales._id },
      ],
    );
    companyDbs.set(tenant.dbName, db);
  });

  test('dry run plans the changes, writes nothing and audits nothing', async () => {
    const before = clone(db.roles);
    const summary = await syncTenantRoles(tenant, { dryRun: true, actor: ACTOR });
    assert.equal(summary.dryRun, true);
    assert.deepEqual([...summary.created].sort(), ['accountant', 'accounts', 'compliance', 'tenant_admin', 'viewer']);
    assert.deepEqual([...summary.updated].sort(), ['ops', 'sales']);
    assert.equal(summary.changes.ops.adopted, true);
    assert.deepEqual(db.roles, before);
    assert.equal(db.writes, 0);
    assert.equal(platform.audit.length, 0);
    assert.deepEqual(connectionCalls, [{ kind: 'uncached', dbName: tenant.dbName }], 'dry run must not use the cached connection');
    assert.equal(db.closed, 1, 'dry-run connection not closed');

    const applied = await syncTenantRoles(tenant, { actor: ACTOR });
    const { dryRun: _a, ...planned } = summary;
    const { dryRun: _b, ...done } = applied;
    assert.deepEqual(done, planned, 'apply did something other than the dry run planned');
  });

  test('apply with enabledModules [Drivers]: tenant_admin = core + Drivers only, no roles.manage, template fields set', async () => {
    const summary = await syncTenantRoles(tenant, { actor: ACTOR });
    const ta = roleNamed(db, 'tenant_admin');
    const expected = [...TENANT_ADMIN_CORE_PERMISSIONS, ...keysIn('Drivers')];
    assert.deepEqual(new Set(ta.permissions), new Set(expected));
    assert.ok(!ta.permissions.includes('roles.manage'));
    assert.equal(ta.templateKey, 'tenant_admin');
    assert.equal(ta.managedBy, 'platform');
    assert.equal(ta.templateVersion, 1);
    assert.equal(ta.assignableByTenant, false);
    assert.equal(ta.isSystemRole, false);
    assert.equal(ta.isActive, true);

    const ceiling = tenantCeiling(tenant);
    for (const r of platformRoles(db)) {
      assert.deepEqual(r.permissions.filter((k) => !ceiling.has(k)), [], `${r.name} exceeds the ceiling`);
      assert.ok(!r.permissions.includes('roles.manage'), `${r.name} has roles.manage`);
    }

    const audit = platform.audit.at(-1);
    assert.equal(audit.action, 'tenant.rolesSynced');
    assert.equal(audit.targetType, 'Tenant');
    assert.equal(audit.targetKey, 'acme-test');
    assert.ok(idEq(audit.targetId, tenant._id));
    assert.deepEqual(audit.actor, ACTOR);
    assert.deepEqual(audit.after, clone(summary));
  });

  test('an old admin role nobody linked is left alone (no admin template any more)', async () => {
    const before = clone(roleNamed(db, 'admin'));
    await syncTenantRoles(tenant, { actor: ACTOR });
    assert.deepEqual(roleNamed(db, 'admin'), before);
    for (const name of ['ops', 'sales']) assert.equal(roleNamed(db, name).isSystemRole, false);
  });

  test('the admin role the migration linked to tenant_admin is updated in place: same _id and name, no second role', async () => {
    const admin = roleNamed(db, 'admin');
    Object.assign(admin, { templateKey: 'tenant_admin', managedBy: 'platform', isSystemRole: false });
    const summary = await syncTenantRoles(tenant, { actor: ACTOR });
    assert.ok(summary.updated.includes('admin'));
    assert.ok(!summary.created.includes('tenant_admin'));
    assert.equal(db.roles.filter((r) => r.templateKey === 'tenant_admin').length, 1);
    assert.equal(roleNamed(db, 'tenant_admin'), undefined);
    const after = roleNamed(db, 'admin');
    assert.ok(idEq(after._id, admin._id));
    assert.equal(after.displayName, 'Company Admin');
    assert.deepEqual(new Set(after.permissions), new Set([...TENANT_ADMIN_CORE_PERMISSIONS, ...keysIn('Drivers')]));
    assert.ok(!after.permissions.includes('roles.manage'));
    assert.equal(after.isSystemRole, false);
    assert.ok(db.users.some((u) => idEq(u.roleId, admin._id)), 'admin user lost its role');
    const again = await syncTenantRoles(tenant, { actor: ACTOR });
    assert.ok(again.unchanged.includes('admin'));
  });

  test('a role linked by templateKey wins over a role with the template\'s name', async () => {
    db.roles.push({ _id: new mongoose.Types.ObjectId(), name: 'Field Ops', displayName: 'Field Ops', permissions: [], isSystemRole: false, isActive: true, templateKey: 'ops', managedBy: 'platform' });
    const opsBefore = clone(roleNamed(db, 'ops'));
    const summary = await syncTenantRoles(tenant, { actor: ACTOR });
    assert.ok(summary.updated.includes('Field Ops'));
    assert.deepEqual(roleNamed(db, 'ops'), opsBefore, 'the unlinked role named ops was changed');
  });

  test('two roles linked to one template, or a same-name role linked elsewhere, are conflicts', async () => {
    db.roles.push({ _id: new mongoose.Types.ObjectId(), name: 'viewer_a', displayName: 'A', permissions: [], isSystemRole: false, isActive: true, templateKey: 'viewer' });
    db.roles.push({ _id: new mongoose.Types.ObjectId(), name: 'viewer_b', displayName: 'B', permissions: [], isSystemRole: false, isActive: true, templateKey: 'viewer' });
    roleNamed(db, 'sales').templateKey = 'something_else';
    const summary = await syncTenantRoles(tenant, { dryRun: true });
    assert.deepEqual(summary.conflicts.filter((c) => c.templateKey === 'viewer').map((c) => c.roleName).sort(), ['viewer_a', 'viewer_b']);
    assert.match(summary.conflicts.find((c) => c.templateKey === 'sales').reason, /linked to template "something_else"/);
    assert.ok(!summary.created.includes('viewer') && !summary.updated.includes('sales'));
  });

  test('second apply: everything unchanged, nothing written', async () => {
    await syncTenantRoles(tenant, { actor: ACTOR });
    const writes = db.writes;
    const second = await syncTenantRoles(tenant, { actor: ACTOR });
    assert.deepEqual(second.created, []);
    assert.deepEqual(second.updated, []);
    assert.deepEqual(second.deactivated, []);
    assert.equal(second.unchanged.length, ROLE_TEMPLATES.length);
    assert.equal(db.writes, writes);
  });

  test('removing Drivers takes drivers.* off every platform-managed role', async () => {
    await syncTenantRoles(tenant, { actor: ACTOR });
    assert.ok(roleNamed(db, 'tenant_admin').permissions.some((k) => k.startsWith('drivers.')));
    tenant.enabledModules = [];
    const summary = await syncTenantRoles(tenant, { actor: ACTOR });
    assert.ok(summary.updated.includes('tenant_admin'));
    for (const r of platformRoles(db)) {
      assert.deepEqual(r.permissions.filter((k) => k.startsWith('drivers.')), [], `${r.name} still has drivers.*`);
    }
  });

  test('removing a template key switches the role off, keeps it and its users', async () => {
    await syncTenantRoles(tenant, { actor: ACTOR });
    const salesId = roleNamed(db, 'sales')._id;
    tenant.roleTemplateKeys = tenant.roleTemplateKeys.filter((k) => k !== 'sales');
    const summary = await syncTenantRoles(tenant, { actor: ACTOR });
    assert.deepEqual(summary.deactivated, ['sales']);
    assert.equal(summary.usersOnDeactivatedRoles, 1);
    const sales = roleNamed(db, 'sales');
    assert.ok(sales, 'role was deleted');
    assert.equal(sales.isActive, false);
    assert.ok(db.users.some((u) => idEq(u.roleId, salesId)), 'user no longer points at the role');

    const again = await syncTenantRoles(tenant, { actor: ACTOR });
    assert.deepEqual(again.deactivated, [], 'already switched off');
    assert.equal(again.usersOnDeactivatedRoles, 1, 'still reported while users point at it');

    tenant.roleTemplateKeys.push('sales');
    const back = await syncTenantRoles(tenant, { actor: ACTOR });
    assert.deepEqual(back.updated, ['sales']);
    assert.equal(roleNamed(db, 'sales').isActive, true);
    assert.equal(back.usersOnDeactivatedRoles, 0);
  });

  test('roles with managedBy tenant, and other custom roles, are never touched', async () => {
    tenant.roleTemplateKeys = tenant.roleTemplateKeys.filter((k) => k !== 'ops');
    await syncTenantRoles(tenant, { actor: ACTOR });
    tenant.enabledModules = [];
    await syncTenantRoles(tenant, { actor: ACTOR });
    for (const r of tenantOwned) assert.deepEqual(roleNamed(db, r.name), r);
    // ops predates Phase 2 and was never taken over: not platform-managed, so not switched off
    assert.equal(roleNamed(db, 'ops').managedBy, undefined);
    assert.equal(roleNamed(db, 'ops').isActive, true);
  });

  test('name conflicts: a case-only match or an exact match managed by the company skips the template', async () => {
    db.roles.push({ _id: new mongoose.Types.ObjectId(), name: 'Viewer', displayName: 'Viewer (custom)', permissions: [], isSystemRole: false, isActive: true });
    db.roles.push({ _id: new mongoose.Types.ObjectId(), name: 'accounts', displayName: 'Accounts (ours)', permissions: ['drivers.view'], isSystemRole: false, isActive: true, managedBy: 'tenant' });
    const before = clone(db.roles.filter((r) => ['Viewer', 'accounts'].includes(r.name)));
    const summary = await syncTenantRoles(tenant, { actor: ACTOR });
    assert.deepEqual(summary.conflicts.map((c) => [c.templateKey, c.roleName]).sort(), [['accounts', 'accounts'], ['viewer', 'Viewer']]);
    assert.ok(!summary.created.includes('viewer') && !summary.created.includes('accounts'));
    assert.ok(!db.roles.some((r) => r.name === 'viewer'), 'near-duplicate created');
    assert.deepEqual(db.roles.filter((r) => ['Viewer', 'accounts'].includes(r.name)), before);
  });

  test('works for a provisioning company with an empty database; new roles are not system roles', async () => {
    const fresh = makeTenant({ key: 'newco', status: 'provisioning', enabledModules: ['Attendance'], roleTemplateKeys: ['tenant_admin', 'viewer'] });
    const freshDb = makeCompanyDb();
    companyDbs.set(fresh.dbName, freshDb);
    const summary = await syncTenantRoles(fresh, { actor: ACTOR });
    assert.deepEqual(summary.created, ['tenant_admin', 'viewer']);
    assert.equal(freshDb.roles.length, 2);
    for (const r of freshDb.roles) assert.equal(r.isSystemRole, false);
    assert.deepEqual(new Set(roleNamed(freshDb, 'viewer').permissions), new Set(['attendance.view', 'notifications.view']));
  });

  test('a missing template is reported, not guessed', async () => {
    tenant.roleTemplateKeys = ['tenant_admin', 'no_such_template'];
    const summary = await syncTenantRoles(tenant, { dryRun: true });
    assert.deepEqual(summary.missingTemplates, ['no_such_template']);
  });

  test('a failed write is audited with the error and rethrown', async () => {
    db.failOnUpdateOf = 'ops';
    await assert.rejects(syncTenantRoles(tenant, { actor: ACTOR }), /simulated write failure/);
    const audit = platform.audit.at(-1);
    assert.equal(audit.action, 'tenant.rolesSynced');
    assert.match(audit.after.error, /simulated write failure/);
    assert.ok(Array.isArray(audit.after.written));
  });

  test('an unreachable company database rejects (company creation must stay provisioning)', async () => {
    const lost = makeTenant({ key: 'lost-co', status: 'provisioning', roleTemplateKeys: ['tenant_admin'] });
    await assert.rejects(syncTenantRoles(lost, { actor: ACTOR }), /cannot reach database/);
  });
});

describe('syncTenantsUsingTemplate', () => {
  test('edited template: every company using it (any status) gets the new version; failures are isolated', async () => {
    platform.templates = seededTemplates();
    platform.audit = [];
    companyDbs.clear();
    const a = makeTenant({ key: 'alpha-co', status: 'active', enabledModules: ['Drivers'], roleTemplateKeys: ['tenant_admin', 'ops'] });
    const b = makeTenant({ key: 'bravo-co', status: 'provisioning', enabledModules: ['Drivers'], roleTemplateKeys: ['ops'] });
    const c = makeTenant({ key: 'charlie-co', status: 'suspended', roleTemplateKeys: ['ops'] }); // no database: fails
    const d = makeTenant({ key: 'delta-co', roleTemplateKeys: ['viewer'] }); // doesn't use ops
    platform.tenants = [d, c, b, a];
    for (const t of [a, b, d]) companyDbs.set(t.dbName, makeCompanyDb());
    for (const t of [a, b]) await syncTenantRoles(t);

    // Edit the template the way a route would: doc.save() bumps the version.
    const ops = platform.templates.find((t) => t.key === 'ops');
    ops.permissions.push('drivers.force_status');
    ops.version += 1;

    const result = await syncTenantsUsingTemplate('ops', { actor: ACTOR });
    assert.deepEqual(result.ok, ['alpha-co', 'bravo-co']);
    assert.equal(result.failed.length, 1);
    assert.equal(result.failed[0].key, 'charlie-co');
    assert.match(result.failed[0].error, /cannot reach database/);
    for (const t of [a, b]) {
      const role = roleNamed(companyDbs.get(t.dbName), 'ops');
      assert.equal(role.templateVersion, 2);
      assert.ok(role.permissions.includes('drivers.force_status'));
    }
    assert.equal(roleNamed(companyDbs.get(d.dbName), 'ops'), undefined);
  });
});

describe('planRoleSync', () => {
  test('is pure and order-insensitive on permissions', () => {
    const template = { key: 'viewer', displayName: 'V', description: 'd', permissions: ['drivers.view', 'notifications.view'], assignableByTenant: true, version: 3 };
    const role = {
      _id: 'r1', name: 'viewer', displayName: 'V', description: 'd', permissions: ['notifications.view', 'drivers.view'],
      templateKey: 'viewer', managedBy: 'platform', assignableByTenant: true, templateVersion: 3, isActive: true,
    };
    const input = { roleTemplateKeys: ['viewer'], ceiling: tenantCeiling({ enabledModules: ['Drivers'] }), templates: [template], roles: [role] };
    const frozen = clone(input.roles);
    const plan = planRoleSync(input);
    assert.deepEqual(plan.summary.unchanged, ['viewer']);
    assert.deepEqual(plan.upserts, []);
    assert.deepEqual(input.roles, frozen);
  });
});
