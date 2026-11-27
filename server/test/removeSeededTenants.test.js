/**
 * npm run platform:remove-seeded-tenants, against in-memory fakes.  npm test
 */
process.env.NODE_ENV = 'test';
process.env.APP_DOMAIN = 'logiforce.test';
process.env.MONGODB_BASE_URI = 'mongodb://tenant-db.invalid';

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { makeModel, clone } = require('./helpers/fakeDb');

const platformModels = require('../src/platform/models');
const platform = {};
platformModels.getPlatformModels = () => platform;

const { parseArgs, removeSeededTenants } = require('../src/platform/scripts/removeSeededTenants');

const id = () => new mongoose.Types.ObjectId();
const ownerId = id();
const ids = { olda: id(), oldb: id(), logi: id(), console: id(), registered: id() };

const DATA_DBS = new Set(['oldmain_db', 'acme_db']);
const inspect = async (dbName) => ({ collections: DATA_DBS.has(dbName) ? ['drivers', 'users'] : [] });
const quiet = () => {};

beforeEach(() => {
  platform.Tenant = makeModel([
    { _id: ids.olda, key: 'olda', name: 'Old A', dbName: 'logiforce_olda', status: 'active', createdBy: null },
    { _id: ids.oldb, key: 'oldb', name: 'Old B', dbName: 'logiforce_oldb', status: 'active', createdBy: null },
    { _id: ids.logi, key: 'oldmain', name: 'Old Main', dbName: 'oldmain_db', status: 'active', createdBy: null },
    { _id: ids.console, key: 'acme', name: 'Acme', dbName: 'acme_db', status: 'active', createdBy: ownerId },
    { _id: ids.registered, key: 'beta', name: 'Beta', dbName: 'beta_db', status: 'active', createdBy: null },
  ]);
  const system = { userId: null, email: 'system' };
  platform.PlatformAuditLog = makeModel([
    { action: 'tenant.create', targetType: 'Tenant', targetId: ids.olda, actor: system },
    { action: 'tenant.create', targetType: 'Tenant', targetId: ids.oldb, actor: system },
    { action: 'tenant.create', targetType: 'Tenant', targetId: ids.logi, actor: system },
    { action: 'tenant.create', targetType: 'Tenant', targetId: ids.console, actor: { userId: ownerId, email: 'owner@x.test' } },
    { action: 'tenant.register', targetType: 'Tenant', targetId: ids.registered, actor: system },
  ]);
  platform.PlatformAuditLog.record = async (e) => { platform.PlatformAuditLog.docs.push(clone(e)); };
});

const keys = () => platform.Tenant.docs.map((t) => t.key).sort();

describe('remove-seeded-tenants', () => {
  test('arguments', () => {
    assert.deepEqual(parseArgs([]), { apply: false, keys: [] });
    assert.deepEqual(parseArgs(['--apply', '--key', 'OldA', '--key=oldb']), { apply: true, keys: ['olda', 'oldb'] });
    assert.throws(() => parseArgs(['--force']), /Unknown argument/);
    assert.throws(() => parseArgs(['--key']), /needs a value/);
  });

  test('dry run writes nothing', async () => {
    const { removed, kept } = await removeSeededTenants({ inspect, log: quiet });
    assert.deepEqual(removed, ['olda', 'oldb']);
    assert.deepEqual(kept, ['oldmain']);
    assert.equal(platform.Tenant.docs.length, 5);
    assert.equal(platform.PlatformAuditLog.docs.length, 5);
  });

  test('--apply removes seeded companies with no data; keeps one with data, console and registered ones', async () => {
    const { removed, kept } = await removeSeededTenants({ apply: true, inspect, log: quiet });
    assert.deepEqual(removed, ['olda', 'oldb']);
    assert.deepEqual(kept, ['oldmain']);
    assert.deepEqual(keys(), ['acme', 'beta', 'oldmain']);
    const deletes = platform.PlatformAuditLog.docs.filter((e) => e.action === 'tenant.delete');
    assert.deepEqual(deletes.map((e) => e.targetKey).sort(), ['olda', 'oldb']);
    assert.equal(deletes[0].actor.email, 'system');
    assert.ok(deletes[0].before);
  });

  test('--key limits the run and removes a named seeded company even if its database holds data', async () => {
    const { removed, notFound } = await removeSeededTenants({ apply: true, keys: ['oldmain', 'acme', 'beta'], inspect, log: quiet });
    assert.deepEqual(removed, ['oldmain']);
    assert.deepEqual(notFound, ['acme', 'beta'], 'console-created and registered companies are never candidates');
    assert.deepEqual(keys(), ['acme', 'beta', 'olda', 'oldb']);
  });

  test('a database that cannot be read keeps the record', async () => {
    const failing = async () => { throw new Error('connect failed mongodb://user:pw@host'); };
    const lines = [];
    const { removed, kept } = await removeSeededTenants({ apply: true, inspect: failing, log: (l) => lines.push(l) });
    assert.deepEqual(removed, []);
    assert.equal(kept.length, 3);
    assert.equal(platform.Tenant.docs.length, 5);
    assert.ok(lines.every((l) => !l.includes('user:pw')), 'URIs are redacted');
  });
});
