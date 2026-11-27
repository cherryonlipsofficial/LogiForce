/**
 * Platform console endpoints (Step 12).  npm test
 *
 *   GET/PATCH /api/platform/tenants[/:key], suspend, reactivate, sync-roles
 *   GET/PATCH /api/platform/role-templates[/:key]
 *   GET /api/platform/audit-logs[/actions], GET /api/platform/meta
 *
 * No MongoDB: platform models and company databases are in-memory fakes
 * (test/helpers/fakeDb.js). The role sync itself is stubbed here (it has its
 * own tests in roleSync.test.js); these tests check that it is called when it
 * should be and that its result or failure is reported.
 */
process.env.NODE_ENV = 'test';
process.env.APP_DOMAIN = 'logiforce.test';
process.env.MONGODB_BASE_URI = 'mongodb://tenant-db.invalid'; // only to build URIs; never opened
process.env.JWT_SECRET = 'tenant-secret-for-tests-only-000000000000';
process.env.PLATFORM_JWT_SECRET = 'platform-secret-for-tests-only-11111111111';

require('express-async-errors');
const { test, describe, beforeEach, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { makeModel, clone, idEq } = require('./helpers/fakeDb');
const { systemRoleDocs, platformUserDoc } = require('./helpers/platformRoles');

const platformModels = require('../src/platform/models');
const platform = {};
platformModels.getPlatformModels = () => platform;

const connectionManager = require('../src/config/connectionManager');
const roleSync = require('../src/platform/services/roleSync.service');
const { ROLE_TEMPLATES } = require('../src/config/defaultRoles');
const { MODULES, isPlatformPermission } = require('../src/config/permissions');
const { signPlatformToken } = require('../src/platform/services/platformAuth.service');
const { buildFilter } = require('../src/platform/services/platformAudit.service');
const logger = require('../src/utils/logger');

const { ObjectId } = mongoose.Types;

// ── Fakes ──

const sameSet = (a = [], b = []) => a.length === b.length && a.every((x) => b.includes(x));

// RoleTemplate needs real documents: the service edits one and calls save().
const makeRoleTemplateModel = (docs) => {
  const model = makeModel(docs);
  const toDoc = (raw) => {
    const doc = { ...raw };
    Object.defineProperty(doc, 'toObject', { value: () => clone(doc) });
    Object.defineProperty(doc, 'save', {
      value: async () => {
        const stored = model.docs.find((d) => idEq(d._id, doc._id));
        if (!sameSet(stored.permissions, doc.permissions)) doc.version += 1;
        Object.assign(stored, clone(doc), { updatedAt: new Date() });
        return doc;
      },
    });
    return doc;
  };
  const plainFindOne = model.findOne;
  model.findOne = (filter) => {
    const q = plainFindOne(filter);
    return { then: (ok, fail) => q.then((raw) => (raw ? toDoc(raw) : null)).then(ok, fail) };
  };
  return model;
};

let clock = Date.parse('2026-11-01T00:00:00Z');
const resetPlatform = () => {
  platform.Tenant = makeModel([
    { _id: new ObjectId(), key: 'acme', name: 'Acme', dbName: 'logiforce_acme', status: 'active', enabledModules: ['Drivers'], roleTemplateKeys: ['tenant_admin', 'viewer'], adminEmail: 'ada@acme.test', createdAt: new Date('2026-10-01') },
    { _id: new ObjectId(), key: 'bolt', name: 'Bolt', dbName: 'logiforce_bolt', status: 'suspended', enabledModules: [], roleTemplateKeys: ['tenant_admin'], createdAt: new Date('2026-10-02') },
    { _id: new ObjectId(), key: 'crumb', name: 'Crumb', dbName: 'logiforce_crumb', status: 'provisioning', provisioningError: { step: 'invite', message: 'x', at: new Date('2026-10-03') }, enabledModules: [], roleTemplateKeys: ['tenant_admin'], createdAt: new Date('2026-10-03') },
  ], { unique: ['key'] });
  platform.RoleTemplate = makeRoleTemplateModel([
    ...ROLE_TEMPLATES.map((t) => ({ _id: new ObjectId(), ...clone({ ...t, permissions: [...t.permissions] }), version: 1 })),
    { _id: new ObjectId(), key: 'admin', displayName: 'Old admin', permissions: [], assignableByTenant: true, version: 3 },
  ]);
  platform.PlatformUser = makeModel([]);
  platform.PlatformRole = makeModel(systemRoleDocs());
  platform.PlatformAuditLog = makeModel([]);
  platform.PlatformAuditLog.record = async ({ req, ...e }) => {
    clock += 1000;
    platform.PlatformAuditLog.docs.push({ _id: new ObjectId(), ...clone(e), createdAt: new Date(clock), ...(req ? { ip: req.ip } : {}) });
  };
};
const audit = (action) => platform.PlatformAuditLog.docs.filter((e) => e.action === action);

// One fake company database per tenant, with an admin and a normal user.
const companyDbs = new Map();
const companyDb = (dbName) => {
  if (!companyDbs.has(dbName)) {
    const adminRole = { _id: new ObjectId(), name: 'tenant_admin', templateKey: 'tenant_admin' };
    const viewerRole = { _id: new ObjectId(), name: 'viewer', templateKey: 'viewer' };
    companyDbs.set(dbName, {
      Role: makeModel([adminRole, viewerRole]),
      User: makeModel([
        { name: 'Ada Admin', email: 'ada@acme.test', roleId: adminRole._id, isActive: true, lastLogin: new Date('2026-11-20') },
        { name: 'Vic Viewer', email: 'vic@acme.test', roleId: viewerRole._id, isActive: true },
      ]),
    });
  }
  return companyDbs.get(dbName);
};
let connectFails = false;
connectionManager.getConnectionForTenant = async (tenantConfig) => {
  if (connectFails) throw new Error('connect ECONNREFUSED mongodb://user:secret@db.internal/x');
  return { models: companyDb(tenantConfig.dbName) };
};

const syncCalls = { tenants: [], templates: [] };
let syncFails = false;
roleSync.syncTenantRoles = async (tenant, { actor }) => {
  syncCalls.tenants.push({ key: tenant.key, enabledModules: tenant.enabledModules, roleTemplateKeys: tenant.roleTemplateKeys, actor });
  if (syncFails) throw new Error('write failed on mongodb://user:secret@db.internal/x');
  return { created: [], updated: ['viewer'], unchanged: [], deactivated: [], conflicts: [], missingTemplates: [], usersOnDeactivatedRoles: 0 };
};
roleSync.syncTenantsUsingTemplate = async (key, { actor }) => {
  syncCalls.templates.push({ key, actor });
  const tenants = platform.Tenant.docs.filter((t) => (t.roleTemplateKeys || []).includes(key));
  return { ok: tenants.map((t) => t.key).sort(), failed: [] };
};

// ── HTTP harness ──

const owner = platformUserDoc('platform_owner', { email: 'owner@platform.test', name: 'O' });
const support = platformUserDoc('platform_support', { email: 'support@platform.test', name: 'S' });
let server;
let base;
const call = async (method, path, { body, as = owner } = {}) => {
  const headers = { 'content-type': 'application/json' };
  if (as) headers.authorization = `Bearer ${signPlatformToken(as)}`;
  const res = await fetch(`${base}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json().catch(() => null) };
};

before(async () => {
  const express = require('express');
  const app = express();
  app.use(express.json());
  app.use('/api/platform', require('../src/platform/platform.routes'));
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}/api/platform`;
});
after(() => new Promise((resolve) => server.close(resolve)));

const realLoggerError = logger.error;
before(() => { logger.error = () => {}; });
after(() => { logger.error = realLoggerError; });

beforeEach(() => {
  resetPlatform();
  platform.PlatformUser.docs.push(clone(owner), clone(support));
  companyDbs.clear();
  connectFails = false;
  syncFails = false;
  syncCalls.tenants = [];
  syncCalls.templates = [];
});

// ── Access ──

describe('who can do what', () => {
  test('no token → 401; support reads but cannot change companies or templates', async () => {
    assert.equal((await call('GET', '/tenants', { as: null })).status, 401);
    for (const path of ['/tenants', '/tenants/acme', '/role-templates', '/audit-logs', '/audit-logs/actions', '/meta']) {
      assert.equal((await call('GET', path, { as: support })).status, 200, path);
    }
    const writes = [
      ['PATCH', '/tenants/acme', { name: 'X' }],
      ['POST', '/tenants/acme/suspend', {}],
      ['POST', '/tenants/bolt/reactivate', {}],
      ['POST', '/tenants/acme/sync-roles', {}],
      ['PATCH', '/role-templates/viewer', { displayName: 'X' }],
    ];
    for (const [method, path, body] of writes) {
      assert.equal((await call(method, path, { body, as: support })).status, 403, `${method} ${path}`);
    }
    assert.equal(platform.PlatformAuditLog.docs.length, 0, 'nothing was changed');
    assert.equal(platform.Tenant.docs.find((t) => t.key === 'acme').name, 'Acme');
  });
});

// ── Companies ──

describe('companies', () => {
  test('list: key, name, status, created date, newest first; filter by status and search', async () => {
    const res = await call('GET', '/tenants');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.tenants.map((t) => t.key), ['crumb', 'bolt', 'acme']);
    const acme = res.body.tenants.find((t) => t.key === 'acme');
    assert.equal(acme.name, 'Acme');
    assert.equal(acme.status, 'active');
    assert.ok(acme.createdAt);
    assert.equal(acme.url, 'https://acme.logiforce.test');
    assert.ok(!('dbUriEnv' in acme) && !('dbName' in acme), 'the list stays small');

    assert.deepEqual((await call('GET', '/tenants?status=suspended')).body.tenants.map((t) => t.key), ['bolt']);
    assert.deepEqual((await call('GET', '/tenants?search=CRU')).body.tenants.map((t) => t.key), ['crumb']);
    assert.deepEqual((await call('GET', '/tenants?search=.*')).body.tenants, [], 'search is literal text');
  });

  test('detail lists the company admins from its own database; an unreachable database is reported, not fatal', async () => {
    const res = await call('GET', '/tenants/acme');
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.tenant.key, 'acme');
    assert.equal(res.body.tenant.activeUsers, 2);
    assert.deepEqual(res.body.admins.map((a) => a.email), ['ada@acme.test']);
    assert.equal(res.body.adminsError, null);

    connectFails = true;
    const down = await call('GET', '/tenants/acme');
    assert.equal(down.status, 200);
    assert.equal(down.body.admins, null);
    assert.match(down.body.adminsError, /ECONNREFUSED/);
    assert.ok(!/secret/.test(down.body.adminsError), 'URI redacted');

    assert.equal((await call('GET', '/tenants/nope')).status, 404);
  });

  test('module switches and allowed roles: saved, audited, then the role sync runs', async () => {
    const res = await call('PATCH', '/tenants/acme', {
      body: { enabledModules: ['Drivers', 'Salary'], roleTemplateKeys: ['viewer', 'sales'] },
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual(res.body.changed.sort(), ['enabledModules', 'roleTemplateKeys']);
    const stored = platform.Tenant.docs.find((t) => t.key === 'acme');
    assert.deepEqual(stored.enabledModules, ['Drivers', 'Salary']);
    assert.deepEqual(stored.roleTemplateKeys, ['tenant_admin', 'viewer', 'sales'], 'tenant_admin is always kept');

    const [entry] = audit('tenant.update');
    assert.equal(entry.actor.email, owner.email);
    assert.deepEqual(entry.before, { enabledModules: ['Drivers'], roleTemplateKeys: ['tenant_admin', 'viewer'] });
    assert.deepEqual(entry.after.enabledModules, ['Drivers', 'Salary']);

    assert.equal(syncCalls.tenants.length, 1);
    assert.deepEqual(syncCalls.tenants[0].enabledModules, ['Drivers', 'Salary'], 'sync sees the saved record');
    assert.equal(syncCalls.tenants[0].actor.email, owner.email);
    assert.equal(res.body.roleSync.ok, true);
    assert.deepEqual(res.body.roleSync.updated, ['viewer']);
  });

  test('a name-only change or no change does not sync; nothing changed writes no audit entry', async () => {
    const same = await call('PATCH', '/tenants/acme', { body: { enabledModules: ['Drivers'] } });
    assert.equal(same.status, 200);
    assert.deepEqual(same.body.changed, []);
    assert.equal(platform.PlatformAuditLog.docs.length, 0);

    const renamed = await call('PATCH', '/tenants/acme', { body: { name: '  Acme Group ' } });
    assert.deepEqual(renamed.body.changed, ['name']);
    assert.equal(renamed.body.roleSync, null);
    assert.equal(syncCalls.tenants.length, 0);
    assert.equal(platform.Tenant.docs.find((t) => t.key === 'acme').name, 'Acme Group');
  });

  test('a failed sync keeps the change and says so; sync-roles retries it', async () => {
    syncFails = true;
    const res = await call('PATCH', '/tenants/acme', { body: { enabledModules: [] } });
    assert.equal(res.status, 200);
    assert.equal(res.body.roleSync.ok, false);
    assert.ok(!/secret/.test(res.body.roleSync.error), 'URI redacted');
    assert.deepEqual(platform.Tenant.docs.find((t) => t.key === 'acme').enabledModules, []);

    syncFails = false;
    const retry = await call('POST', '/tenants/acme/sync-roles');
    assert.equal(retry.status, 200);
    assert.equal(retry.body.roleSync.ok, true);
  });

  test('bad input → 400 listing each problem; nothing saved', async () => {
    const res = await call('PATCH', '/tenants/acme', {
      body: { enabledModules: ['Drivers', 'Teleport'], roleTemplateKeys: ['admin'], name: '', dbName: 'x' },
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'VALIDATION_ERROR');
    assert.match(res.body.errors.enabledModules, /Teleport/);
    assert.match(res.body.errors.roleTemplateKeys, /Retired/);
    assert.match(res.body.errors.name, /empty/);
    assert.match(res.body.errors.body, /dbName/);
    assert.equal((await call('PATCH', '/tenants/acme', { body: { roleTemplateKeys: ['ghost'] } })).body.errors.roleTemplateKeys, 'Unknown role template(s): ghost');
    assert.equal(platform.PlatformAuditLog.docs.length, 0);
  });

  test('a failed or provisioning company is finished through provisioning, not edited', async () => {
    const res = await call('PATCH', '/tenants/crumb', { body: { name: 'C' } });
    assert.equal(res.status, 409);
    assert.equal(res.body.code, 'TENANT_NOT_EDITABLE');
  });

  test('suspend and reactivate: only from the opposite status; audited with the reason', async () => {
    const s = await call('POST', '/tenants/acme/suspend', { body: { reason: 'Unpaid invoice' } });
    assert.equal(s.status, 200, JSON.stringify(s.body));
    assert.equal(s.body.tenant.status, 'suspended');
    assert.equal(platform.Tenant.docs.find((t) => t.key === 'acme').status, 'suspended');
    assert.deepEqual(audit('tenant.suspend')[0].before, { status: 'active' });
    assert.deepEqual(audit('tenant.suspend')[0].after, { status: 'suspended', reason: 'Unpaid invoice' });

    const again = await call('POST', '/tenants/acme/suspend');
    assert.equal(again.status, 409);
    assert.equal(again.body.code, 'TENANT_STATUS');

    const r = await call('POST', '/tenants/acme/reactivate');
    assert.equal(r.body.tenant.status, 'active');
    assert.equal(audit('tenant.reactivate').length, 1);

    assert.equal((await call('POST', '/tenants/crumb/reactivate')).status, 409, 'a company still provisioning is not reactivated');
  });
});

// ── Role templates ──

describe('role templates', () => {
  test('list shows every template with the companies that use it', async () => {
    const res = await call('GET', '/role-templates');
    assert.equal(res.status, 200);
    const viewer = res.body.templates.find((t) => t.key === 'viewer');
    assert.deepEqual(viewer.usedBy, ['acme']);
    assert.deepEqual(res.body.templates.find((t) => t.key === 'tenant_admin').usedBy, ['acme', 'bolt', 'crumb']);
    assert.equal(res.body.templates.find((t) => t.key === 'admin').retired, true);
  });

  test('editing permissions bumps the version, is audited, and syncs every company using the template', async () => {
    const before = platform.RoleTemplate.docs.find((t) => t.key === 'viewer');
    const permissions = [...before.permissions.filter((p) => p !== 'salary.view'), 'drivers.edit'];
    const res = await call('PATCH', '/role-templates/viewer', { body: { permissions, version: 1 } });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual(res.body.changed, ['permissions']);
    assert.equal(res.body.template.version, 2);
    assert.deepEqual(res.body.sync, { ok: ['acme'], failed: [] });
    assert.deepEqual(syncCalls.templates.map((c) => c.key), ['viewer']);
    assert.equal(syncCalls.templates[0].actor.email, owner.email);

    const [entry] = audit('roleTemplate.update');
    assert.equal(entry.targetKey, 'viewer');
    assert.deepEqual(entry.after.permissionsAdded, ['drivers.edit']);
    assert.deepEqual(entry.after.permissionsRemoved, ['salary.view']);

    // Someone saving against the old version is told to reload.
    const stale = await call('PATCH', '/role-templates/viewer', { body: { permissions: ['drivers.view'], version: 1 } });
    assert.equal(stale.status, 409);
    assert.equal(stale.body.code, 'TEMPLATE_STALE');
    assert.equal(stale.body.currentVersion, 2);
  });

  test('a display-name change does not bump the version but still syncs; no change does nothing', async () => {
    const res = await call('PATCH', '/role-templates/viewer', { body: { displayName: 'Viewer (read only)' } });
    assert.equal(res.body.template.version, 1);
    assert.equal(syncCalls.templates.length, 1);

    const none = await call('PATCH', '/role-templates/viewer', { body: { displayName: 'Viewer (read only)' } });
    assert.deepEqual(none.body.changed, []);
    assert.equal(none.body.sync, null);
    assert.equal(syncCalls.templates.length, 1);
  });

  test('refused: platform or unknown permissions, tenant_admin made assignable, retired or unknown templates', async () => {
    const platformKey = await call('PATCH', '/role-templates/viewer', { body: { permissions: ['drivers.view', 'roles.manage'] } });
    assert.equal(platformKey.status, 400);
    assert.match(platformKey.body.errors.permissions, /roles\.manage/);
    assert.match((await call('PATCH', '/role-templates/viewer', { body: { permissions: ['nope.nope'] } })).body.errors.permissions, /Unknown/);
    const assignable = await call('PATCH', '/role-templates/tenant_admin', { body: { assignableByTenant: true } });
    assert.equal(assignable.status, 400);
    assert.equal((await call('PATCH', '/role-templates/admin', { body: { displayName: 'x' } })).status, 409);
    assert.equal((await call('PATCH', '/role-templates/ghost', { body: { displayName: 'x' } })).status, 404);
    assert.equal(syncCalls.templates.length, 0);
    assert.equal(platform.PlatformAuditLog.docs.length, 0);
  });
});

// ── Audit log and meta ──

describe('audit log', () => {
  const seed = async () => {
    for (let i = 0; i < 30; i += 1) {
      await platform.PlatformAuditLog.record({
        actor: { email: i % 2 ? 'owner@platform.test' : 'system' },
        action: i % 3 ? 'tenant.update' : 'roleTemplate.update',
        targetType: i % 3 ? 'Tenant' : 'RoleTemplate',
        targetId: new ObjectId(),
        targetKey: i % 3 ? `co-${i}` : 'viewer',
      });
    }
  };

  test('paged, newest first', async () => {
    await seed();
    const p1 = await call('GET', '/audit-logs?limit=10');
    assert.equal(p1.status, 200);
    assert.equal(p1.body.entries.length, 10);
    assert.deepEqual(p1.body.pagination, { page: 1, limit: 10, total: 30, pages: 3 });
    const times = p1.body.entries.map((e) => Date.parse(e.createdAt));
    assert.deepEqual(times, [...times].sort((a, b) => b - a));
    const p3 = await call('GET', '/audit-logs?limit=10&page=3');
    assert.equal(p3.body.entries.length, 10);
    assert.ok(Date.parse(p3.body.entries[0].createdAt) < times.at(-1));
    assert.equal((await call('GET', '/audit-logs?limit=5000')).body.pagination.limit, 100, 'limit is capped');
  });

  test('filters: action, target type, target key, actor, date range', async () => {
    await seed();
    const byAction = (await call('GET', '/audit-logs?action=roleTemplate.update&limit=100')).body;
    assert.equal(byAction.pagination.total, 10);
    assert.ok(byAction.entries.every((e) => e.action === 'roleTemplate.update'));
    assert.equal((await call('GET', '/audit-logs?targetType=Tenant&limit=100')).body.pagination.total, 20);
    assert.equal((await call('GET', '/audit-logs?targetKey=CO-11&limit=100')).body.pagination.total, 1, 'contains, any case');
    assert.equal((await call('GET', '/audit-logs?targetKey=co-2&limit=100')).body.pagination.total, 8, 'co-2 and co-20…co-29');
    assert.equal((await call('GET', '/audit-logs?actor=owner&limit=100')).body.pagination.total, 15);

    const all = (await call('GET', '/audit-logs?limit=100')).body.entries;
    const mid = all[14].createdAt;
    assert.equal((await call('GET', `/audit-logs?from=${encodeURIComponent(mid)}&limit=100`)).body.pagination.total, 15);
    assert.equal((await call('GET', `/audit-logs?to=${encodeURIComponent(mid)}&limit=100`)).body.pagination.total, 16);

    assert.equal((await call('GET', '/audit-logs?targetType=Robot')).status, 400);
    assert.equal((await call('GET', '/audit-logs?from=yesterday')).status, 400);
  });

  test('filter values are literal text, and a bare end date covers the whole day', () => {
    assert.deepEqual(buildFilter({ actor: 'a.b+c' })['actor.email'], { $regex: 'a\\.b\\+c', $options: 'i' });
    assert.equal(buildFilter({ to: '2026-11-25' }).createdAt.$lte.toISOString(), '2026-11-25T23:59:59.999Z');
  });

  test('actions endpoint lists the distinct actions for the filter', async () => {
    await seed();
    const res = await call('GET', '/audit-logs/actions');
    assert.deepEqual(res.body.actions, ['roleTemplate.update', 'tenant.update']);
    assert.ok(res.body.targetTypes.includes('Tenant'));
  });
});

describe('meta', () => {
  test('modules and the permission catalogue, without platform-only permissions', async () => {
    const res = await call('GET', '/meta');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.modules, [...MODULES]);
    assert.ok(res.body.coreModules.includes('Users'));
    const keys = Object.values(res.body.permissionsByModule).flat().map((p) => p.key);
    assert.ok(keys.includes('drivers.view'));
    assert.ok(!keys.some(isPlatformPermission));
    assert.equal(res.body.tenantAdminTemplateKey, 'tenant_admin');
  });
});
