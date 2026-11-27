/**
 * Platform models (Step 1): Tenant, PlatformUser, PlatformRole, PlatformAuditLog.
 * Schema validation only; no MongoDB (an unopened connection validates fine).
 */
process.env.NODE_ENV = 'test';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const conn = mongoose.createConnection(); // never opened
const Tenant = conn.model('Tenant', require('../src/platform/models/Tenant').schema, 'tenants');
const PlatformUser = conn.model('PlatformUser', require('../src/platform/models/PlatformUser').schema, 'platform_users');
const PlatformRole = conn.model('PlatformRole', require('../src/platform/models/PlatformRole').schema, 'platform_roles');
const { TARGET_TYPES } = require('../src/platform/models/PlatformAuditLog');
const { TENANT_STATUSES, TENANT_KEY_PATTERN, tenantKeyProblem } = require('../src/platform/models/Tenant');

const errorsOf = (doc) => Object.keys(doc.validateSync()?.errors || {});

describe('Tenant', () => {
  test('statuses are provisioning, active, suspended, archived', () => {
    assert.deepEqual([...TENANT_STATUSES], ['provisioning', 'active', 'suspended', 'archived']);
    assert.ok(errorsOf(new Tenant({ key: 'acme', name: 'Acme', status: 'failed' })).includes('status'));
  });

  test('key: /^[a-z][a-z0-9-]{2,30}$/, reserved names refused', () => {
    assert.equal(String(TENANT_KEY_PATTERN), String(/^[a-z][a-z0-9-]{2,30}$/));
    for (const key of ['www', 'api', 'admin', 'app', 'platform', 'mail', 'static']) {
      assert.match(tenantKeyProblem(key), /reserved/, key);
    }
    assert.equal(tenantKeyProblem('acme-freight'), null);
    assert.ok(tenantKeyProblem('9lives'));
  });

  test('defaults: provisioning, dbName from key, no self signup, empty contact', async () => {
    const t = new Tenant({ key: 'acme-co', name: 'Acme' });
    await t.validate(); // runs pre('validate'), which derives dbName
    assert.equal(t.status, 'provisioning');
    assert.equal(t.dbName, 'logiforce_acme_co');
    assert.equal(t.allowSelfSignup, false);
    assert.equal(t.limits.maxUsers, null);
    assert.deepEqual({ ...t.contact.toObject() }, { name: '', email: '', phone: '' });
    assert.equal(t.get('dbUriEnv'), undefined, 'no per-company env var');
  });

  test('contact email is checked', () => {
    assert.ok(errorsOf(new Tenant({ key: 'acme', name: 'A', contact: { email: 'nope' } })).includes('contact.email'));
  });
});

describe('PlatformUser', () => {
  test('roleKey required, active by default, invitedBy recorded', () => {
    assert.ok(errorsOf(new PlatformUser({ email: 'a@b.co', name: 'A' })).includes('roleKey'));
    const u = new PlatformUser({ email: 'a@b.co', name: 'A', roleKey: 'platform_support', invitedBy: new mongoose.Types.ObjectId() });
    assert.deepEqual(errorsOf(u), []);
    assert.equal(u.isActive, true);
    assert.equal(u.get('role'), undefined);
  });
});

describe('PlatformRole', () => {
  test('holds platform permissions only', () => {
    assert.deepEqual(errorsOf(new PlatformRole({ key: 'billing_desk', displayName: 'B', permissions: ['platform.tenants.view'] })), []);
    const bad = new PlatformRole({ key: 'bad', displayName: 'B', permissions: ['platform.tenants.view', 'drivers.view'] });
    assert.ok(errorsOf(bad).includes('permissions'));
  });
});

describe('PlatformAuditLog', () => {
  test('PlatformRole is a target type', () => assert.ok(TARGET_TYPES.includes('PlatformRole')));
});
