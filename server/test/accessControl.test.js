/**
 * Access control (Phase 2, Steps 7–9).  npm test
 *
 * One function decides a company user's permissions (getEffectivePermissions):
 * no admin bypass, no '*', always cut to the tenant's ceiling. Roles are
 * read-only for companies, and user management is guarded.
 *
 * No MongoDB: the platform lookup and each company's collections are small
 * in-memory fakes. The real resolveTenant, protect, permission middleware,
 * routes, services and the real User schema methods (loadRole, getPermissions)
 * run on top of them. A populate with a select only returns the selected
 * fields, so a narrow populate really does leave `permissions` out.
 */
process.env.NODE_ENV = 'test';
process.env.APP_DOMAIN = 'logiforce.test';
process.env.JWT_SECRET = 'test-jwt-secret-for-access-control';
process.env.MONGODB_BASE_URI = 'mongodb://tenant-db.invalid'; // only to build each company's URI; never opened
process.env.TENANT_CACHE_TTL_MS = '0'; // tests change tenant settings between requests
delete process.env.RESEND_API_KEY;
delete process.env.EMAIL_DEV_LOG;

require('express-async-errors');
const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const mongoose = require('mongoose');

const { ObjectId } = mongoose.Types;
const {
  PERMISSIONS, tenantCeiling, getEffectivePermissions, isPlatformPermission,
} = require('../src/config/permissions');
const { ROLE_TEMPLATES } = require('../src/config/defaultRoles');
const RealUser = require('../src/modules/shared/User');

// ── Fake platform DB: must be in place before config/tenants.js loads ──

const tenantRecords = {};
const resetTenant = () => {
  tenantRecords.acme = {
    _id: new ObjectId(), key: 'acme', name: 'Acme LLC', dbName: 'logiforce_acme', status: 'active',
    enabledModules: ['Drivers', 'Compliance', 'Attendance', 'Salary', 'Advances'],
    // The roles the platform offers this company (fixture roles are linked by name).
    roleTemplateKeys: ['tenant_admin', 'manager', 'driver_desk', 'finance', 'hidden', 'retired', 'hr'],
    limits: { maxUsers: null },
    allowSelfSignup: false,
  };
};
resetTenant();
const platformModels = require('../src/platform/models');
platformModels.getPlatformModels = () => ({
  Tenant: {
    db: { readyState: 1 },
    findOne: ({ key }) => ({ lean: async () => (tenantRecords[key] ? structuredClone({ ...tenantRecords[key], _id: String(tenantRecords[key]._id) }) : null) }),
  },
});

// ── Fake company database ──

const norm = (v) => {
  if (v instanceof ObjectId) return String(v);
  if (v && typeof v === 'object' && v._id !== undefined) return String(v._id);
  return v;
};
const getPath = (obj, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
const isOperatorObject = (c) => c && typeof c === 'object' && !(c instanceof ObjectId) && !Array.isArray(c)
  && Object.keys(c).some((k) => k.startsWith('$'));
const valueMatches = (val, want) => (Array.isArray(val) ? val.map(norm).includes(norm(want)) : norm(val) === norm(want));

const matches = (doc, filter = {}) => Object.entries(filter).every(([key, cond]) => {
  if (key === '$or') return cond.some((f) => matches(doc, f));
  const val = getPath(doc, key);
  if (!isOperatorObject(cond)) return valueMatches(val, cond);
  return Object.entries(cond).every(([op, arg]) => {
    switch (op) {
      case '$ne': return !valueMatches(val, arg);
      case '$in': return arg.some((a) => valueMatches(val, a));
      case '$nin': return !arg.some((a) => valueMatches(val, a));
      case '$elemMatch': return Array.isArray(val) && val.some((e) => matches(e, arg));
      default: throw new Error(`fake db: unsupported operator ${op}`);
    }
  });
});

const pick = (obj, select) => {
  if (!select) return obj;
  const fields = select.split(/\s+/).filter(Boolean);
  const out = { _id: obj._id };
  for (const f of fields) if (f in obj) out[f] = obj[f];
  return out;
};

const copy = (raw) => Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v.map((e) => (e && typeof e === 'object' && !(e instanceof ObjectId) ? { ...e } : e)) : v]));

const db = {};
const stores = () => db;

const userMethods = {
  loadRole: RealUser.schema.methods.loadRole,
  getPermissions: RealUser.schema.methods.getPermissions,
  hasPermission: RealUser.schema.methods.hasPermission,
};

const makeDoc = (modelName, raw) => {
  const doc = copy(raw);
  Object.defineProperties(doc, {
    id: { get() { return String(this._id); } }, // Mongoose's string id virtual
    save: { value: async function save() {
      const stored = Object.fromEntries(Object.entries(this).map(([k, v]) => [k, k === 'roleId' ? (v && v._id ? v._id : v) : v]));
      const list = stores()[modelName];
      const i = list.findIndex((r) => String(r._id) === String(this._id));
      if (i >= 0) list[i] = stored; else list.push(stored);
      return this;
    } },
    populate: { value: async function populate(arg, sel) {
      const path = typeof arg === 'string' ? arg : arg.path;
      const select = typeof arg === 'string' ? sel : arg.select;
      if (path === 'roleId' && this.roleId) {
        const role = stores().Role.find((r) => String(r._id) === String(norm(this.roleId)));
        this.roleId = role ? pick(copy(role), select) : null;
      }
      return this;
    } },
    populated: { value(path) { return path === 'roleId' && this.roleId && this.roleId._id && !(this.roleId instanceof ObjectId) ? this.roleId._id : undefined; } },
    depopulate: { value(path) { if (this.populated(path)) this.roleId = this.roleId._id; return this; } },
    toObject: { value() { return { ...this }; } },
    toJSON: { value() { const o = { ...this }; delete o.password; return o; } },
    comparePassword: { value: async function (p) { return p === this.password; } },
    ...(modelName === 'User' ? Object.fromEntries(Object.entries(userMethods).map(([k, fn]) => [k, { value: fn }])) : {}),
  });
  return doc;
};

const makeQuery = (modelName, run) => {
  const pops = [];
  let isLean = false;
  const q = {
    select: () => q, sort: () => q, skip: () => q, limit: () => q,
    populate: (path, sel) => { pops.push([path, sel]); return q; },
    lean: () => { isLean = true; return q; },
    then: (ok, fail) => Promise.resolve().then(async () => {
      const result = run();
      const one = async (raw) => {
        if (!raw) return null;
        const doc = makeDoc(modelName, raw);
        for (const [path, sel] of pops) await doc.populate(path, sel);
        return isLean ? { ...doc } : doc;
      };
      return Array.isArray(result) ? Promise.all(result.map(one)) : one(result);
    }).then(ok, fail),
  };
  return q;
};

const DEFAULTS = { User: { isActive: false, permissionOverrides: [] }, Role: { isActive: true, assignableByTenant: true, templateKey: null } };
const makeModel = (name) => {
  const model = {
    find: (filter) => makeQuery(name, () => db[name].filter((r) => matches(r, filter))),
    findOne: (filter) => makeQuery(name, () => db[name].find((r) => matches(r, filter)) || null),
    findById: (id) => makeQuery(name, () => db[name].find((r) => String(r._id) === String(id)) || null),
    countDocuments: async (filter) => db[name].filter((r) => matches(r, filter)).length,
    create: async (data) => {
      const doc = makeDoc(name, { _id: new ObjectId(), ...(DEFAULTS[name] || {}), ...data });
      await doc.save();
      return doc;
    },
    aggregate: async () => {
      const counts = new Map();
      for (const r of db[name]) counts.set(String(r.roleId), (counts.get(String(r.roleId)) || 0) + 1);
      return [...counts].map(([id, count]) => ({ _id: new ObjectId(id), count }));
    },
  };
  if (name === 'User') model.ROLE_ACCESS_FIELDS = RealUser.ROLE_ACCESS_FIELDS;
  return model;
};

const MODEL_NAMES = ['User', 'Role', 'AuditLog', 'Driver', 'AttendanceBatch', 'SalaryRun', 'DriverAdvance', 'GuaranteePassport'];
const connection = { models: Object.fromEntries(MODEL_NAMES.map((n) => [n, makeModel(n)])) };
connection.models.AuditLog.create = async () => ({});

const connectionManager = require('../src/config/connectionManager');
connectionManager.getConnectionForTenant = async () => connection;

// Stub the driver status engine before driverWorkflow.service destructures it.
const statusEngine = require('../src/modules/drivers/driverStatusEngine.service');
const statusChanges = [];
statusEngine.applyStatusChange = async (req, driver, newStatus) => { statusChanges.push(newStatus); driver.status = newStatus; await driver.save(); };
require('../src/modules/drivers/driverHistory.service').logEvent = async () => {};

// ── App under test ──

const { resolveTenant } = require('../src/middleware/tenant');
const { requireAnyPermission } = require('../src/middleware/auth');
const { generateToken } = require('../src/modules/shared/auth.service');
const { getTenantBySubdomain } = require('../src/config/tenants');
const errorHandler = require('../src/middleware/errorHandler');
const logger = require('../src/utils/logger');
const { changeStatusManual } = require('../src/modules/drivers/driverWorkflow.service');
const { approveAttendance } = require('../src/modules/attendance/attendanceApproval.service');
const { getPendingApprovalsSummary } = require('../src/modules/shared/pendingApprovals.service');

const app = express();
app.use(express.json());
app.use('/api', resolveTenant);
app.use('/api/auth', require('../src/modules/shared/auth.routes'));
app.use('/api/roles', require('../src/modules/shared/roles.routes'));
app.use('/api/users', require('../src/modules/shared/users.routes'));
app.use('/api', require('../src/modules/compliance/guaranteePassport.routes'));
app.use(errorHandler);

let server;
let baseUrl;
const api = async (method, route, { token, body, tenant = 'acme' } = {}) => {
  const headers = { 'content-type': 'application/json', 'x-tenant-id': tenant };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${baseUrl}${route}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json().catch(() => null) };
};

// ── Fixtures ──

const template = (key) => ROLE_TEMPLATES.find((t) => t.key === key);
const ALL_KEYS = Object.keys(PERMISSIONS);
let roles;
let users;
const tokenFor = (user) => generateToken(user._id, 'acme');

const addRole = (fields) => {
  const role = { _id: new ObjectId(), isActive: true, assignableByTenant: true, templateKey: fields.name ?? null, managedBy: 'platform', isSystemRole: false, ...fields };
  db.Role.push(role);
  return role;
};
const addUser = (fields) => {
  const user = { _id: new ObjectId(), password: 'pw', isActive: true, permissionOverrides: [], ...fields };
  user.email = user.email || `${String(user._id)}@acme.test`;
  user.name = user.name || user.email;
  db.User.push(user);
  return user;
};
const stored = (model, id) => db[model].find((r) => String(r._id) === String(id));

beforeEach(() => {
  resetTenant();
  for (const n of MODEL_NAMES) db[n] = [];
  statusChanges.length = 0;
  roles = {
    tenantAdmin: addRole({ name: 'tenant_admin', displayName: 'Company Admin', templateKey: 'tenant_admin', managedBy: 'platform', assignableByTenant: false, permissions: [...template('tenant_admin').permissions] }),
    // The old system admin role: every key, roles.manage included, isSystemRole true.
    legacyAdmin: addRole({ name: 'admin', displayName: 'Administrator', isSystemRole: true, templateKey: null, managedBy: 'tenant', permissions: [...ALL_KEYS] }),
    // Can manage access, but only holds driver/attendance basics.
    manager: addRole({ name: 'manager', displayName: 'Manager', permissions: ['users.view', 'users.create', 'users.edit', 'users.manage_access', 'drivers.view', 'drivers.edit', 'attendance.view'] }),
    drivers: addRole({ name: 'driver_desk', displayName: 'Driver desk', permissions: ['drivers.view', 'drivers.edit'] }),
    finance: addRole({ name: 'finance', displayName: 'Finance', permissions: ['drivers.view', 'salary.view'] }),
    hidden: addRole({ name: 'hidden', displayName: 'Not assignable', assignableByTenant: false, permissions: ['drivers.view'] }),
    off: addRole({ name: 'retired', displayName: 'Retired', isActive: false, permissions: ['drivers.view'] }),
    editOnly: addRole({ name: 'hr', displayName: 'HR', permissions: ['users.view', 'users.edit'] }),
  };
  users = {
    admin: addUser({ name: 'Admin', roleId: roles.tenantAdmin._id }),
    admin2: addUser({ name: 'Second admin', roleId: roles.tenantAdmin._id }),
    legacy: addUser({ name: 'Legacy admin', roleId: roles.legacyAdmin._id }),
    manager: addUser({ name: 'Manager', roleId: roles.manager._id }),
    staff: addUser({ name: 'Staff', roleId: roles.drivers._id }),
    hr: addUser({ name: 'HR', roleId: roles.editOnly._id }),
    dormant: addUser({ name: 'Dormant', roleId: roles.drivers._id, isActive: false }),
  };
});

before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => { server.once('listening', resolve); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => { server.close(resolve); });
});

// Quiet the error handler's log line for expected 4xx responses.
const realLoggerError = logger.error;
before(() => { logger.error = () => {}; });
after(() => { logger.error = realLoggerError; });

const tenantConfig = () => getTenantBySubdomain('acme');
const fakeReq = async () => ({ tenant: await tenantConfig(), tenantKey: 'acme', dbConnection: connection });
const loadUser = (id) => connection.models.User.findById(id).populate('roleId', 'name displayName');

// ── 1–3: getEffectivePermissions ──

describe('getEffectivePermissions', () => {
  test('1. tenant_admin gets exactly its role permissions within the ceiling: no *, no roles.manage', async () => {
    const tenant = await tenantConfig();
    const ceiling = tenantCeiling(tenant);
    const expected = template('tenant_admin').permissions.filter((k) => ceiling.has(k)).sort();

    const res = await api('POST', '/api/auth/login', { body: { email: stored('User', users.admin._id).email, password: 'pw' } });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual([...res.body.data.permissions].sort(), expected);
    assert.ok(!res.body.data.permissions.includes('*'));
    assert.ok(!res.body.data.permissions.includes('roles.manage'));
    assert.ok(!('isAdmin' in res.body.data), 'response still has isAdmin');
    // Modules the tenant has not enabled are cut, even for the admin template.
    assert.ok(!res.body.data.permissions.includes('invoices.view'));

    const me = await api('GET', '/api/auth/me', { token: res.body.data.token });
    assert.equal(me.status, 200);
    assert.deepEqual([...me.body.data.permissions].sort(), expected);
    assert.ok(!('isAdmin' in me.body.data));
    assert.ok(!('isSystemRole' in me.body.data.user.roleId));
  });

  test('1b. the old isSystemRole admin no longer bypasses: platform keys and disabled modules are cut', async () => {
    const res = await api('GET', '/api/auth/permissions', { token: tokenFor(users.legacy) });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const perms = res.body.data.permissions;
    const ceiling = tenantCeiling(await tenantConfig());
    assert.deepEqual([...perms].sort(), ALL_KEYS.filter((k) => ceiling.has(k)).sort());
    assert.ok(!perms.includes('roles.manage') && !perms.includes('*'));
    assert.ok(!('isSystemRole' in res.body.data.role));
  });

  test('2. a permission from a module the tenant has not enabled is removed, even if an override grants it', async () => {
    stored('User', users.staff._id).permissionOverrides = [{ key: 'invoices.view', granted: true }, { key: 'roles.manage', granted: true }, { key: 'attendance.view', granted: true }];
    const tenant = await tenantConfig();
    const user = await loadUser(users.staff._id);
    const perms = await user.getPermissions(tenant);
    assert.ok(!perms.includes('invoices.view'));
    assert.ok(!perms.includes('roles.manage'));
    assert.ok(perms.includes('attendance.view'), 'override for an enabled module still applies');

    const res = await api('GET', `/api/users/${users.staff._id}/permissions`, { token: tokenFor(users.admin) });
    assert.equal(res.status, 200);
    assert.ok(!res.body.data.effectivePermissions.includes('invoices.view'));
  });

  test('3. an inactive role gives no permissions (overrides still apply within the ceiling)', async () => {
    const tenant = await tenantConfig();
    const user = addUser({ roleId: roles.off._id });
    assert.deepEqual(await (await loadUser(user._id)).getPermissions(tenant), []);
    assert.deepEqual(getEffectivePermissions(tenant, { roleId: { permissions: ['drivers.view'], isActive: false } }), []);

    const res = await api('GET', '/api/roles/assignable', { token: tokenFor(user) });
    assert.equal(res.status, 403);
  });

  test('refuses to guess: no tenant, or an unpopulated roleId, throws', async () => {
    const tenant = await tenantConfig();
    assert.throws(() => getEffectivePermissions(null, { roleId: null }), /requires a tenant/);
    assert.throws(() => getEffectivePermissions(tenant, { roleId: new ObjectId() }), /populated/);
    const user = await loadUser(users.staff._id);
    await assert.rejects(() => user.getPermissions(), /requires a tenant/);
  });

  test('User#getPermissions re-populates a narrowly populated role', async () => {
    const user = await loadUser(users.staff._id);
    assert.equal(user.roleId.permissions, undefined, 'fixture: narrow populate drops permissions');
    assert.deepEqual((await user.getPermissions(await tenantConfig())).sort(), ['drivers.edit', 'drivers.view']);
  });
});

// ── 4–5: roles are read-only ──

describe('roles are read-only for companies', () => {
  test('4. POST /roles, PUT/DELETE /roles/:id and POST /roles/:id/duplicate → 404', async () => {
    const token = tokenFor(users.admin);
    const id = String(roles.drivers._id);
    const body = { name: 'x_role', displayName: 'X', permissions: ['drivers.view'], newName: 'y_role', newDisplayName: 'Y' };
    for (const [method, route] of [['POST', '/api/roles'], ['PUT', `/api/roles/${id}`], ['DELETE', `/api/roles/${id}`], ['POST', `/api/roles/${id}/duplicate`]]) {
      const res = await fetch(`${baseUrl}${route}`, { method, headers: { 'content-type': 'application/json', 'x-tenant-id': 'acme', authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
      assert.equal(res.status, 404, `${method} ${route}`);
    }
    assert.equal(db.Role.length, 8, 'no role was created or deleted');
  });

  test('GET /roles needs roles.view and lists active roles only; GET /roles/:id 404s an inactive role', async () => {
    assert.equal((await api('GET', '/api/roles', { token: tokenFor(users.staff) })).status, 403);
    const res = await api('GET', '/api/roles', { token: tokenFor(users.admin) });
    assert.equal(res.status, 200);
    const names = res.body.data.map((r) => r.name);
    assert.ok(names.includes('driver_desk'));
    assert.ok(!names.includes('retired'));
    assert.equal((await api('GET', `/api/roles/${roles.off._id}`, { token: tokenFor(users.admin) })).status, 404);
    assert.equal((await api('GET', `/api/roles/${roles.drivers._id}`, { token: tokenFor(users.admin) })).status, 200);
  });

  test('5. /roles/assignable leaves out roles with permissions the caller lacks and assignableByTenant:false', async () => {
    const res = await api('GET', '/api/roles/assignable', { token: tokenFor(users.manager) });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const names = res.body.data.map((r) => r.name).sort();
    // manager holds drivers.view/edit and users.view/edit → driver_desk and hr only
    assert.deepEqual(names, ['driver_desk', 'hr', 'manager']);

    const asAdmin = (await api('GET', '/api/roles/assignable', { token: tokenFor(users.admin) })).body.data.map((r) => r.name);
    assert.ok(!asAdmin.includes('tenant_admin'), 'tenant_admin is assignableByTenant:false');
    assert.ok(!asAdmin.includes('hidden'));
    assert.ok(!asAdmin.includes('retired'));
    assert.ok(!asAdmin.includes('admin'), 'legacy admin role holds roles.manage, which no company user has');
    assert.ok(asAdmin.includes('finance'));

    // users.edit alone is not enough to read it
    assert.equal((await api('GET', '/api/roles/assignable', { token: tokenFor(users.hr) })).status, 403);
  });
});

// ── 6–9: user management guards ──

describe('user management guards', () => {
  test('6. assigning a role with extra permissions → 403 listing the missing keys', async () => {
    const token = tokenFor(users.manager);
    const put = await api('PUT', `/api/users/${users.staff._id}/role`, { token, body: { roleId: String(roles.finance._id) } });
    assert.equal(put.status, 403);
    assert.deepEqual(put.body, { success: false, message: "You can't assign access you don't have: salary.view" });
    assert.equal(String(stored('User', users.staff._id).roleId), String(roles.drivers._id));

    const post = await api('POST', '/api/users', { token, body: { name: 'New', email: 'new@acme.test', password: 'password1', roleId: String(roles.finance._id) } });
    assert.equal(post.status, 403);
    assert.match(post.body.message, /salary\.view/);

    const edit = await api('PUT', `/api/users/${users.staff._id}`, { token, body: { roleId: String(roles.finance._id) } });
    assert.equal(edit.status, 403);
    assert.match(edit.body.message, /salary\.view/);

    const hidden = await api('PUT', `/api/users/${users.staff._id}/role`, { token: tokenFor(users.admin), body: { roleId: String(roles.hidden._id) } });
    assert.deepEqual(hidden, { status: 403, body: { success: false, message: 'This role is not available to assign' } });

    const ok = await api('PUT', `/api/users/${users.staff._id}/role`, { token: tokenFor(users.admin), body: { roleId: String(roles.finance._id) } });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal(String(stored('User', users.staff._id).roleId), String(roles.finance._id));
  });

  test('7. an admin changing their own access → 403; changing another tenant_admin → 403', async () => {
    const token = tokenFor(users.admin);
    const self = String(users.admin._id);
    const other = String(users.admin2._id);
    for (const target of [self, other]) {
      const role = await api('PUT', `/api/users/${target}/role`, { token, body: { roleId: String(roles.drivers._id) } });
      assert.equal(role.status, 403, `role ${target}`);
      const grant = await api('POST', `/api/users/${target}/permissions/override`, { token, body: { key: 'drivers.view', granted: false } });
      assert.equal(grant.status, 403, `override ${target}`);
      const edit = await api('PUT', `/api/users/${target}`, { token, body: { roleId: String(roles.drivers._id) } });
      assert.equal(edit.status, 403, `edit ${target}`);
    }
    for (const id of [self, other]) assert.equal(String(stored('User', id).roleId), String(roles.tenantAdmin._id));
    stored('User', other).permissionOverrides = [{ key: 'drivers.view', granted: false }];
    assert.equal((await api('DELETE', `/api/users/${other}/permissions/override/drivers.view`, { token })).status, 403);
  });

  test('override endpoints: users.manage_access, ceiling, and only grants the caller holds', async () => {
    const target = `/api/users/${users.staff._id}/permissions/override`;
    const hr = await api('POST', target, { token: tokenFor(users.hr), body: { key: 'drivers.view', granted: true } });
    assert.equal(hr.status, 403, 'users.edit alone cannot change access');

    const token = tokenFor(users.manager);
    assert.equal((await api('POST', target, { token, body: { key: 'invoices.view', granted: true } })).status, 403, 'outside ceiling');
    assert.equal((await api('POST', target, { token, body: { key: 'roles.manage', granted: true } })).status, 403, 'platform key');
    const notMine = await api('POST', target, { token, body: { key: 'salary.view', granted: true } });
    assert.deepEqual(notMine, { status: 403, body: { success: false, message: "You can't grant access you don't have: salary.view" } });

    const revoke = await api('POST', target, { token, body: { key: 'salary.view', granted: false } });
    assert.equal(revoke.status, 200, 'revoking a key you lack is fine');
    const grant = await api('POST', target, { token, body: { key: 'attendance.view', granted: true } });
    assert.equal(grant.status, 200, JSON.stringify(grant.body));
    assert.ok(grant.body.data.effectivePermissions.includes('attendance.view'));

    // Removing the salary.view deny hands the key back, so it needs the key too.
    assert.equal((await api('DELETE', `${target}/salary.view`, { token })).status, 403);
    assert.equal((await api('DELETE', `${target}/attendance.view`, { token })).status, 200);
  });

  test('8. creating an active user over maxUsers → 403; reactivating over the limit → 403', async () => {
    const active = db.User.filter((u) => u.isActive).length; // 6
    tenantRecords.acme.limits = { maxUsers: active };
    const token = tokenFor(users.admin);

    const reg = await api('POST', '/api/auth/register', { token, body: { name: 'Seat Taker', email: 'seat@acme.test', password: 'password1', roleId: String(roles.drivers._id), isActive: true } });
    assert.deepEqual(reg, { status: 403, body: { success: false, message: 'User limit reached for this company' } });
    assert.ok(!db.User.some((u) => u.email === 'seat@acme.test'));

    const activate = await api('PUT', `/api/users/${users.dormant._id}/activate`, { token });
    assert.deepEqual(activate, { status: 403, body: { success: false, message: 'User limit reached for this company' } });
    const edit = await api('PUT', `/api/users/${users.dormant._id}`, { token, body: { isActive: true } });
    assert.equal(edit.status, 403);
    assert.equal(stored('User', users.dormant._id).isActive, false);

    // Inactive users take no seat.
    const inactive = await api('POST', '/api/users', { token, body: { name: 'Later', email: 'later@acme.test', password: 'password1', roleId: String(roles.drivers._id) } });
    assert.equal(inactive.status, 201, JSON.stringify(inactive.body));

    tenantRecords.acme.limits = { maxUsers: active + 1 };
    assert.equal((await api('PUT', `/api/users/${users.dormant._id}/activate`, { token })).status, 200);

    tenantRecords.acme.limits = { maxUsers: null };
    const free = await api('POST', '/api/auth/register', { token, body: { name: 'Unlimited', email: 'free@acme.test', password: 'password1', roleId: String(roles.drivers._id), isActive: true } });
    // /auth/register answers 200: it passes 201 to sendSuccess as the message (existing behaviour).
    assert.equal(free.status, 200, JSON.stringify(free.body));
    assert.equal(free.body.success, true);
  });

  test('/auth/register needs users.create, checks the role, and ignores permissionOverrides in the body', async () => {
    const body = { name: 'Reg', email: 'reg@acme.test', password: 'password1', roleId: String(roles.drivers._id) };
    assert.equal((await api('POST', '/api/auth/register', { body })).status, 401);
    assert.equal((await api('POST', '/api/auth/register', { token: tokenFor(users.staff), body })).status, 403);

    const extra = await api('POST', '/api/auth/register', { token: tokenFor(users.manager), body: { ...body, roleId: String(roles.finance._id) } });
    assert.equal(extra.status, 403);
    assert.match(extra.body.message, /salary\.view/);

    const ok = await api('POST', '/api/auth/register', { token: tokenFor(users.manager), body: { ...body, permissionOverrides: [{ key: 'salary.view', granted: true }] } });
    assert.equal(ok.body?.success, true, JSON.stringify(ok.body));
    assert.deepEqual(db.User.find((u) => u.email === 'reg@acme.test').permissionOverrides, []);
  });

  test('9. /auth/register-with-otp → 403 when allowSelfSignup is off, before anything is created', async () => {
    const body = { name: 'Self Signup', email: 'self@acme.test', password: 'password1' };
    const off = await api('POST', '/api/auth/register-with-otp', { body });
    assert.deepEqual(off, { status: 403, body: { success: false, message: 'Self sign-up is not enabled for this company' } });
    assert.ok(!db.User.some((u) => u.email === 'self@acme.test'));

    tenantRecords.acme.allowSelfSignup = true;
    const on = await api('POST', '/api/auth/register-with-otp', { body });
    assert.notEqual(on.status, 403, 'switched on, the request gets past the gate (503 here: no email provider)');
  });
});

// ── Step 13: grantable permissions and the company's allowed roles ──

describe('grantable permissions and allowed roles', () => {
  test('GET /users/grantable-permissions: held by the caller AND within the company limit; needs users.manage_access', async () => {
    assert.equal((await api('GET', '/api/users/grantable-permissions', { token: tokenFor(users.hr) })).status, 403);
    assert.equal((await api('GET', '/api/users/grantable-permissions', { token: tokenFor(users.staff) })).status, 403);

    const asManager = await api('GET', '/api/users/grantable-permissions', { token: tokenFor(users.manager) });
    assert.equal(asManager.status, 200, JSON.stringify(asManager.body));
    assert.deepEqual([...asManager.body.data.keys].sort(), [...roles.manager.permissions].sort());
    const entry = asManager.body.data.permissions.find((p) => p.key === 'drivers.view');
    assert.deepEqual(Object.keys(entry).sort(), ['description', 'key', 'label', 'module']);

    // The admin template holds invoices.*, but the company hasn't enabled Invoices.
    const asAdmin = (await api('GET', '/api/users/grantable-permissions', { token: tokenFor(users.admin) })).body.data.keys;
    const ceiling = tenantCeiling(await tenantConfig());
    assert.ok(asAdmin.length > 0);
    assert.ok(asAdmin.every((k) => ceiling.has(k)), 'everything is within the ceiling');
    assert.ok(!asAdmin.includes('invoices.view'));
    assert.ok(!asAdmin.includes('roles.manage'));
    assert.ok(asAdmin.includes('salary.view'));

    // Switching a module off shrinks the list at once.
    tenantRecords.acme.enabledModules = ['Drivers'];
    const shrunk = (await api('GET', '/api/users/grantable-permissions', { token: tokenFor(users.admin) })).body.data.keys;
    assert.ok(!shrunk.includes('salary.view'));
    assert.ok(shrunk.includes('drivers.view'));
  });

  test('every key outside the grantable list is refused as a grant', async () => {
    const token = tokenFor(users.manager);
    const grantable = new Set((await api('GET', '/api/users/grantable-permissions', { token })).body.data.keys);
    const route = `/api/users/${users.staff._id}/permissions/override`;
    for (const key of ['salary.view', 'invoices.view', 'roles.manage', 'settings.manage', 'users.delete']) {
      assert.ok(!grantable.has(key), `fixture: ${key} is not grantable`);
      const res = await api('POST', route, { token, body: { key, granted: true, reason: 'test' } });
      assert.equal(res.status, 403, key);
    }
    for (const key of grantable) {
      if (key.startsWith('users.')) continue; // staff → manager-level access; fine, but not needed here
      const res = await api('POST', route, { token, body: { key, granted: true, reason: 'test' } });
      assert.equal(res.status, 200, `${key}: ${JSON.stringify(res.body)}`);
    }
  });

  test('/roles/assignable and role assignment only offer roles in the company\'s allowed set', async () => {
    const outside = addRole({ name: 'outsider', displayName: 'Not offered', templateKey: 'outsider', permissions: ['drivers.view'] });
    const unlinked = addRole({ name: 'homemade', displayName: 'Company-made', templateKey: null, managedBy: 'tenant', permissions: ['drivers.view'] });

    const names = (await api('GET', '/api/roles/assignable', { token: tokenFor(users.admin) })).body.data.map((r) => r.name);
    assert.ok(names.includes('driver_desk'));
    assert.ok(!names.includes('outsider'), 'template not in Tenant.roleTemplateKeys');
    assert.ok(!names.includes('homemade'), 'no template link');

    for (const role of [outside, unlinked]) {
      const put = await api('PUT', `/api/users/${users.staff._id}/role`, { token: tokenFor(users.admin), body: { roleId: String(role._id) } });
      assert.deepEqual(put, { status: 403, body: { success: false, message: 'This role is not offered to this company' } });
      const post = await api('POST', '/api/users', { token: tokenFor(users.admin), body: { name: 'N', email: `${role.name}@acme.test`, password: 'password1', roleId: String(role._id) } });
      assert.equal(post.status, 403);
    }
    assert.equal(String(stored('User', users.staff._id).roleId), String(roles.drivers._id));

    // Offering the template to the company makes it assignable.
    tenantRecords.acme.roleTemplateKeys = [...tenantRecords.acme.roleTemplateKeys, 'outsider'];
    const after = (await api('GET', '/api/roles/assignable', { token: tokenFor(users.admin) })).body.data.map((r) => r.name);
    assert.ok(after.includes('outsider'));
  });
});

// ── 10: business rules moved off isSystemRole / roles.manage ──

describe('business rules use the new permissions', () => {
  const roleWith = (perms) => addUser({ roleId: addRole({ name: `r_${new ObjectId()}`, displayName: 'R', permissions: perms })._id });

  test('passport extension approval: guarantee_passports.approve_extension', async () => {
    db.GuaranteePassport.push({ _id: new ObjectId(), extensionRequest: { status: 'pending' } });
    const yes = roleWith(['guarantee_passports.approve_extension']);
    const no = roleWith(['guarantee_passports.view', 'drivers.view']);

    assert.equal((await api('GET', '/api/guarantee-passports/pending-extensions', { token: tokenFor(yes) })).status, 200);
    assert.equal((await api('GET', '/api/guarantee-passports/pending-extensions', { token: tokenFor(no) })).status, 403);
    assert.equal((await api('PUT', `/api/guarantee-passports/${new ObjectId()}/review-extension`, { token: tokenFor(no), body: { decision: 'approved' } })).status, 403);

    const req = await fakeReq();
    assert.equal((await getPendingApprovalsSummary(req, await loadUser(yes._id))).guaranteeExtensions, 1);
    assert.equal((await getPendingApprovalsSummary(req, await loadUser(no._id))).guaranteeExtensions, 0);
    // No bypass: once the tenant drops Compliance, even the old all-keys admin role doesn't see it.
    tenantRecords.acme = { ...tenantRecords.acme, enabledModules: ['Drivers'] };
    assert.equal((await getPendingApprovalsSummary(await fakeReq(), await loadUser(users.legacy._id))).guaranteeExtensions, 0);
  });

  test('force driver status: drivers.force_status', async () => {
    const driver = { _id: new ObjectId(), status: 'draft' };
    db.Driver.push(driver);
    const yes = roleWith(['drivers.change_status', 'drivers.force_status']);
    const no = roleWith(['drivers.change_status']);
    const req = await fakeReq();

    await assert.rejects(() => changeStatusManual(req, driver._id, 'suspended', 'test', no._id), { statusCode: 403, message: 'This status transition is not permitted' });
    assert.deepEqual(statusChanges, []);
    const updated = await changeStatusManual(req, driver._id, 'suspended', 'test', yes._id);
    assert.equal(updated.status, 'suspended');
    assert.deepEqual(statusChanges, ['suspended']);

    // The route admits drivers.force_status as well as drivers.change_status
    const forceOnly = await (async () => {
      const u = await loadUser(roleWith(['drivers.force_status'])._id);
      return runMiddleware(requireAnyPermission(['drivers.change_status', 'drivers.force_status']), u);
    })();
    assert.equal(forceOnly.nextCalled, true);
  });

  test('approve any attendance: attendance.approve_any', async () => {
    const batch = () => {
      const b = { _id: new ObjectId(), status: 'pending_review', salesApproval: { status: 'pending' }, opsApproval: { status: 'pending' }, period: { year: 2026, month: 10 }, projectId: { name: 'P' }, clientId: { name: 'C' } };
      db.AttendanceBatch.push(b);
      return b;
    };
    const yes = roleWith(['attendance.approve_any']);
    const no = roleWith(['attendance.view']);
    const req = await fakeReq();

    await assert.rejects(() => approveAttendance(req, batch()._id, no._id), { statusCode: 403 });
    const b = batch();
    const approved = await approveAttendance(req, b._id, yes._id);
    assert.equal(approved.salesApproval.status, 'approved', 'approve_any approves the side still needed');
    assert.equal(approved.status, 'sales_approved');
    const both = await approveAttendance(req, b._id, yes._id);
    assert.equal(both.status, 'fully_approved');

    const summaryYes = await getPendingApprovalsSummary(req, await loadUser(yes._id));
    const summaryNo = await getPendingApprovalsSummary(req, await loadUser(no._id));
    assert.equal(summaryYes.attendance, 1, 'the untouched batch');
    assert.equal(summaryNo.attendance, 0);

    // The approve route admits approve_any.
    const mw = requireAnyPermission(['attendance.approve_sales', 'attendance.approve_ops', 'attendance.approve_any']);
    assert.equal((await runMiddleware(mw, await loadUser(yes._id))).nextCalled, true);
    assert.equal((await runMiddleware(mw, await loadUser(no._id))).status, 403);
  });

  test('user permission endpoints: users.manage_access (not roles.manage)', async () => {
    const yes = roleWith(['users.view', 'users.manage_access', 'drivers.view']);
    const no = roleWith(['users.view', 'users.edit', 'drivers.view']);
    const route = `/api/users/${users.staff._id}/permissions/override`;
    assert.equal((await api('POST', route, { token: tokenFor(no), body: { key: 'drivers.view', granted: false } })).status, 403);
    assert.equal((await api('POST', route, { token: tokenFor(yes), body: { key: 'drivers.view', granted: false } })).status, 200);
  });
});

// Run one permission middleware against a user, the way a route would.
async function runMiddleware(mw, user) {
  const req = { ...(await fakeReq()), user };
  const res = { status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  let nextCalled = false;
  let error = null;
  await mw(req, res, (err) => { if (err) error = err; else nextCalled = true; });
  if (error) throw error;
  return { nextCalled, status: res.statusCode, permissions: req.userPermissions };
}

// ── Nothing makes an access decision from isSystemRole, isAdmin or '*' ──

describe('no access shortcuts left in src', () => {
  test('no isAdmin, no * permission, no isSystemRole in access code', () => {
    const fs = require('fs');
    const path = require('path');
    const srcDir = path.join(__dirname, '..', 'src');
    const files = [];
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith('.js')) files.push(full);
      }
    };
    walk(srcDir);
    // isSystemRole is still a Role field: seeds, migrations, the role sync and
    // the Role model's delete guard use it as data, never to grant access.
    const allowedIsSystemRole = new Set([
      'modules/shared/Role.js', 'config/db.js', 'config/defaultRoles.js',
      'platform/services/roleSync.service.js', 'scripts/migratePermissions.js', 'scripts/migrateRoleNames.js',
      // finds the old admin role to turn it into tenant_admin
      'scripts/migrateToPlatform.js',
      // writes isSystemRole: false on the roles it seeds
      'scripts/seedRoles.js',
    ]);
    for (const file of files) {
      const rel = path.relative(srcDir, file).split(path.sep).join('/');
      const source = fs.readFileSync(file, 'utf8');
      assert.ok(!/\bisAdmin\b/.test(source), `${rel} mentions isAdmin`);
      assert.ok(!/includes\(\s*['"]\*['"]\s*\)|\[\s*['"]\*['"]\s*\]/.test(source), `${rel} uses a '*' permission`);
      if (!allowedIsSystemRole.has(rel)) assert.ok(!/isSystemRole/.test(source), `${rel} uses isSystemRole`);
    }
    for (const k of Object.keys(PERMISSIONS)) assert.notEqual(k, '*');
    assert.ok(isPlatformPermission('roles.manage'));
  });
});
