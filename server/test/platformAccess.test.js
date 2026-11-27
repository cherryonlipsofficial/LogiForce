/**
 * Platform users, platform roles and platform permissions (Steps 2 and 5).  npm test
 *
 * Every platform route checks a platform permission; Support's defaults allow
 * viewing and helping, nothing else. Rules: no self-change, no granting above
 * your own access, only an Owner makes an Owner, the last active Owner stays.
 * No MongoDB: platform models are in-memory fakes (test/helpers/fakeDb.js).
 */
process.env.NODE_ENV = 'test';
process.env.MONGODB_BASE_URI = 'mongodb://tenant-db.invalid';
process.env.JWT_SECRET = 'tenant-secret-for-tests-only-000000000000';
process.env.PLATFORM_JWT_SECRET = 'platform-secret-for-tests-only-11111111111';
process.env.APP_DOMAIN = 'logiforce.test';

require('express-async-errors');
const { test, describe, beforeEach, before, after } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { makeModel, clone } = require('./helpers/fakeDb');
const { systemRoleDocs, platformUserDoc } = require('./helpers/platformRoles');

const platformModels = require('../src/platform/models');
const platform = {};
platformModels.getPlatformModels = () => platform;

const platformMailer = require('../src/platform/services/platformMailer');
const { signPlatformToken } = require('../src/platform/services/platformAuth.service');
const { PLATFORM_PERMISSION_KEYS, SYSTEM_PLATFORM_ROLES } = require('../src/config/platformPermissions');
const { PERMISSIONS, isPlatformPermission } = require('../src/config/permissions');
const logger = require('../src/utils/logger');

const mailed = [];
platformMailer.sendPlatformSetPasswordEmail = async (m) => { mailed.push(m); };

let owner;
let owner2;
let support;
const reset = () => {
  owner = platformUserDoc('platform_owner', { email: 'owner@platform.test' });
  owner2 = platformUserDoc('platform_owner', { email: 'owner2@platform.test', isActive: false });
  support = platformUserDoc('platform_support', { email: 'support@platform.test' });
  platform.PlatformRole = makeModel(systemRoleDocs(), { unique: ['key'] });
  platform.PlatformUser = makeModel([owner, owner2, support], { unique: ['email'], onCreate: (d) => { d.tokenVersion ??= 0; } });
  platform.PlatformAuditLog = makeModel([]);
  platform.PlatformAuditLog.record = async ({ req, ...e }) => { platform.PlatformAuditLog.docs.push(clone(e)); };
  platform.PlatformLoginChallenge = makeModel([]);
  platform.Tenant = makeModel([]);
  platform.RoleTemplate = makeModel([]);
  mailed.length = 0;
};

let server;
let base;
const call = async (method, path, { body, as, token } = {}) => {
  const headers = { 'content-type': 'application/json' };
  const t = token ?? (as ? signPlatformToken(as) : null);
  if (t) headers.authorization = `Bearer ${t}`;
  const res = await fetch(`${base}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json().catch(() => null) };
};
const stored = (u) => platform.PlatformUser.docs.find((d) => String(d._id) === String(u._id));
const audit = (action) => platform.PlatformAuditLog.docs.filter((e) => e.action === action);

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
beforeEach(reset);

describe('permission catalogue', () => {
  test('platform and company permissions never overlap', () => {
    for (const key of PLATFORM_PERMISSION_KEYS) {
      assert.ok(key.startsWith('platform.'), key);
      assert.ok(!(key in PERMISSIONS), `${key} is also a company permission`);
      assert.ok(isPlatformPermission(key));
    }
    for (const key of Object.keys(PERMISSIONS)) assert.ok(!isPlatformPermission(key), key);
  });

  test('Owner holds every permission; Support holds exactly the defaults', () => {
    assert.deepEqual([...SYSTEM_PLATFORM_ROLES.platform_owner.permissions].sort(), [...PLATFORM_PERMISSION_KEYS].sort());
    assert.deepEqual([...SYSTEM_PLATFORM_ROLES.platform_support.permissions].sort(), [
      'platform.audit.view',
      'platform.role_templates.view',
      'platform.tenant_admins.resend_invite',
      'platform.tenant_admins.reset_password',
      'platform.tenants.view',
    ]);
  });

  test('/auth/me returns the permissions from the role', async () => {
    const me = await call('GET', '/auth/me', { as: support });
    assert.equal(me.status, 200);
    assert.deepEqual(me.body.user.permissions, [...SYSTEM_PLATFORM_ROLES.platform_support.permissions]);
    // The Owner's access is the role list; take a key out of the stored role and nothing changes,
    // because platform_owner is locked to the code list.
    platform.PlatformRole.docs.find((r) => r.key === 'platform_owner').permissions = [];
    assert.equal((await call('GET', '/auth/me', { as: owner })).body.user.permissions.length, PLATFORM_PERMISSION_KEYS.length);
  });

  test('a user whose role is gone has no access', async () => {
    const ghost = platformUserDoc('vanished_role');
    platform.PlatformUser.docs.push(ghost);
    assert.equal((await call('GET', '/tenants', { as: ghost })).status, 403);
  });
});

describe('Support is refused everything beyond view and help', () => {
  test('403 on every change Support may not make, and nothing is written', async () => {
    const id = String(owner._id);
    const refused = [
      ['POST', '/tenants', { key: 'acme', name: 'A' }],
      ['PATCH', '/tenants/acme', { name: 'X' }],
      ['PATCH', '/tenants/acme', { enabledModules: [] }],
      ['POST', '/tenants/acme/suspend'],
      ['POST', '/tenants/acme/reactivate'],
      ['PATCH', '/role-templates/viewer', { displayName: 'X' }],
      ['GET', '/users'],
      ['POST', '/users', { email: 'x@y.co', name: 'X', roleKey: 'platform_support' }],
      ['PATCH', `/users/${id}/role`, { roleKey: 'platform_support' }],
      ['PATCH', `/users/${support._id}/role`, { roleKey: 'platform_owner' }],
      ['POST', `/users/${id}/deactivate`],
      ['POST', '/roles', { key: 'x_role', displayName: 'X', permissions: [] }],
      ['PATCH', '/roles/platform_support', { permissions: PLATFORM_PERMISSION_KEYS }],
      ['DELETE', '/roles/platform_support'],
    ];
    for (const [method, path, body] of refused) {
      const res = await call(method, path, { as: support, body });
      assert.equal(res.status, 403, `${method} ${path}: ${JSON.stringify(res.body)}`);
      assert.equal(res.body.code, 'PLATFORM_FORBIDDEN');
    }
    assert.equal(platform.PlatformAuditLog.docs.length, 0);
    assert.equal(stored(support).roleKey, 'platform_support');
  });

  test('Support can read what its defaults allow', async () => {
    for (const path of ['/tenants', '/role-templates', '/audit-logs', '/meta']) {
      assert.equal((await call('GET', path, { as: support })).status, 200, path);
    }
  });

  test('tokens: none → 401, tenant token → 401, deactivated user → 401', async () => {
    assert.equal((await call('GET', '/tenants')).status, 401);
    const tenantToken = jwt.sign({ id: String(owner._id), tid: 'acme' }, process.env.JWT_SECRET, { audience: 'tenant' });
    assert.equal((await call('GET', '/tenants', { token: tenantToken })).status, 401);
    // Even signed with the platform secret, a tenant-audience token is refused.
    const wrongAud = jwt.sign({ sub: String(owner._id), tv: 0 }, process.env.PLATFORM_JWT_SECRET, { audience: 'tenant' });
    assert.equal((await call('GET', '/tenants', { token: wrongAud })).status, 401);
    assert.equal((await call('GET', '/tenants', { as: owner2 })).status, 401);
  });
});

describe('platform users', () => {
  test('Owner invites Support: no password anywhere, link emailed, audited', async () => {
    const res = await call('POST', '/users', { as: owner, body: { email: 'New@Platform.test', name: 'New', roleKey: 'platform_support' } });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.user.email, 'new@platform.test');
    assert.equal(res.body.user.invitePending, true);
    assert.equal(res.body.invite.sent, true);
    assert.match(mailed[0].url, /^https:\/\/admin\.logiforce\.test\/set-password\/[a-f0-9]{64}$/);
    const doc = platform.PlatformUser.docs.find((d) => d.email === 'new@platform.test');
    assert.equal(doc.passwordHash, null);
    assert.equal(String(doc.invitedBy), String(owner._id));
    assert.equal(audit('platformUser.create').length, 1);
  });

  test('nobody changes their own role or deactivates themselves', async () => {
    const self = await call('PATCH', `/users/${owner._id}/role`, { as: owner, body: { roleKey: 'platform_support' } });
    assert.equal(self.status, 403);
    assert.equal(self.body.code, 'SELF_CHANGE');
    assert.equal((await call('POST', `/users/${owner._id}/deactivate`, { as: owner })).status, 403);
  });

  test('only an Owner makes an Owner; nobody grants above their own access', async () => {
    // A user manager who is not an Owner.
    platform.PlatformRole.docs.push({ key: 'staff_admin', displayName: 'Staff admin', permissions: ['platform.users.view', 'platform.users.manage', 'platform.tenants.view'] });
    const manager = platformUserDoc('staff_admin');
    platform.PlatformRole.docs.push({ key: 'viewer_desk', displayName: 'Viewer', permissions: ['platform.tenants.view'] });
    const viewer = platformUserDoc('viewer_desk');
    platform.PlatformUser.docs.push(manager, viewer);

    const toOwner = await call('PATCH', `/users/${viewer._id}/role`, { as: manager, body: { roleKey: 'platform_owner' } });
    assert.equal(toOwner.status, 403);
    assert.equal(toOwner.body.code, 'OWNER_ONLY');
    const inviteOwner = await call('POST', '/users', { as: manager, body: { email: 'o@x.co', name: 'O', roleKey: 'platform_owner' } });
    assert.equal(inviteOwner.status, 403);

    // platform_support holds keys the manager lacks (resend_invite, ...): can't give it.
    const above = await call('POST', '/users', { as: manager, body: { email: 's@x.co', name: 'S', roleKey: 'platform_support' } });
    assert.equal(above.status, 403);
    assert.equal(above.body.code, 'GRANT_EXCEEDS_OWN_ACCESS');
    // ... and can't touch a user on such a role.
    assert.equal((await call('POST', `/users/${support._id}/deactivate`, { as: manager })).status, 403);
    assert.equal((await call('POST', `/users/${owner._id}/deactivate`, { as: manager })).status, 403);

    // A role within the manager's own access is fine.
    assert.equal((await call('POST', '/users', { as: manager, body: { email: 'v@x.co', name: 'V', roleKey: 'viewer_desk' } })).status, 201);

    // The Owner may make an Owner.
    const promote = await call('PATCH', `/users/${support._id}/role`, { as: owner, body: { roleKey: 'platform_owner' } });
    assert.equal(promote.status, 200);
    assert.equal(stored(support).roleKey, 'platform_owner');
    assert.equal(audit('platformUser.role_change').length, 1);
  });

  test('the last active Owner cannot be deactivated or demoted', async () => {
    const admin = require('../src/platform/services/platformAdmin.service');
    const asActor = (u) => ({ _id: u._id, email: u.email, roleKey: 'platform_owner', permissions: [...PLATFORM_PERMISSION_KEYS] });

    // Only an Owner can act on an Owner, and never on themselves: with one
    // active Owner, nobody can remove them through the API.
    assert.equal((await call('POST', `/users/${owner._id}/deactivate`, { as: owner })).status, 403);

    // The rule itself, for a caller that could otherwise get there:
    await assert.rejects(admin.setUserActive({ id: owner._id, active: false, actor: asActor(owner2) }), (err) => err.code === 'LAST_OWNER');
    await assert.rejects(admin.changeUserRole({ id: owner._id, roleKey: 'platform_support', actor: asActor(owner2) }), (err) => err.code === 'LAST_OWNER');
    assert.equal(stored(owner).isActive, true);
    assert.equal(stored(owner).roleKey, 'platform_owner');

    // Two active Owners removing each other at the same moment: at least one
    // stays (here both requests are refused and both stay).
    stored(owner2).isActive = true;
    const results = await Promise.allSettled([
      admin.setUserActive({ id: owner2._id, active: false, actor: asActor(owner) }),
      admin.setUserActive({ id: owner._id, active: false, actor: asActor(owner2) }),
    ]);
    const active = platform.PlatformUser.docs.filter((u) => u.roleKey === 'platform_owner' && u.isActive);
    assert.ok(active.length >= 1, JSON.stringify(results.map((r) => r.reason?.message || r.status)));
    assert.ok(results.some((r) => r.status === 'rejected' && r.reason.code === 'LAST_OWNER'));

    // With a second active Owner, deactivating one is fine and ends their sessions.
    const third = platformUserDoc('platform_owner', { email: 'third@platform.test' });
    platform.PlatformUser.docs.push(third);
    const res = await call('POST', `/users/${third._id}/deactivate`, { as: active[0] });
    assert.equal(res.status, 200);
    assert.equal(stored(third).tokenVersion, 1);
  });
});

describe('platform roles', () => {
  test('Owner creates, edits and deletes a role; platform keys only', async () => {
    const created = await call('POST', '/roles', { as: owner, body: { key: 'billing_desk', displayName: 'Billing', permissions: ['platform.tenants.view'] } });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const tenantKey = await call('PATCH', '/roles/billing_desk', { as: owner, body: { permissions: ['drivers.view'] } });
    assert.equal(tenantKey.status, 400, 'a company permission is never a platform permission');
    const edited = await call('PATCH', '/roles/billing_desk', { as: owner, body: { permissions: ['platform.tenants.view', 'platform.audit.view'] } });
    assert.equal(edited.status, 200);
    assert.equal((await call('DELETE', '/roles/billing_desk', { as: owner })).status, 200);
    assert.deepEqual(['platformRole.create', 'platformRole.update', 'platformRole.delete'].map((a) => audit(a).length), [1, 1, 1]);
  });

  test('platform_owner is locked; a role in use cannot be deleted; nobody edits their own role', async () => {
    assert.equal((await call('PATCH', '/roles/platform_owner', { as: owner, body: { displayName: 'X' } })).body.code, 'ROLE_LOCKED');
    assert.equal((await call('DELETE', '/roles/platform_owner', { as: owner })).body.code, 'ROLE_LOCKED');
    assert.equal((await call('DELETE', '/roles/platform_support', { as: owner })).body.code, 'ROLE_IN_USE');

    platform.PlatformRole.docs.push({ key: 'role_admin', displayName: 'Role admin', permissions: ['platform.roles.manage', 'platform.tenants.view'] });
    const roleAdmin = platformUserDoc('role_admin');
    platform.PlatformUser.docs.push(roleAdmin);
    const own = await call('PATCH', '/roles/role_admin', { as: roleAdmin, body: { permissions: PLATFORM_PERMISSION_KEYS } });
    assert.equal(own.status, 403);
    assert.equal(own.body.code, 'SELF_CHANGE');
    const above = await call('POST', '/roles', { as: roleAdmin, body: { key: 'big', displayName: 'Big', permissions: ['platform.tenants.create'] } });
    assert.equal(above.body.code, 'GRANT_EXCEEDS_OWN_ACCESS');
  });
});
