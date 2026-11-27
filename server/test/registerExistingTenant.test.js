/**
 * npm run platform:register-tenant (Step 6), against in-memory fakes.  npm test
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

const { MODULES } = require('../src/config/permissions');
const { parseArgs, registerExistingTenant } = require('../src/platform/scripts/registerExistingTenant');

const inspected = [];
const inspect = async (dbName) => {
  inspected.push(dbName);
  return { collections: dbName === 'empty_db' ? [] : ['drivers', 'roles', 'users'] };
};

beforeEach(() => {
  inspected.length = 0;
  platform.Tenant = makeModel([], { unique: ['key', 'dbName'] });
  platform.RoleTemplate = makeModel([{ key: 'tenant_admin' }, { key: 'viewer' }, { key: 'admin' }]);
  platform.PlatformAuditLog = makeModel([]);
  platform.PlatformAuditLog.record = async (e) => { platform.PlatformAuditLog.docs.push(clone(e)); };
});

describe('register-tenant', () => {
  test('every value comes from the arguments', () => {
    assert.deepEqual(parseArgs(['--key', 'acme', '--db', 'acme_db', '--name', 'Acme Ltd']), { key: 'acme', db: 'acme_db', name: 'Acme Ltd' });
    assert.deepEqual(parseArgs(['--key=acme', '--db=acme_db', '--name=Acme']), { key: 'acme', db: 'acme_db', name: 'Acme' });
    assert.throws(() => parseArgs(['--uri', 'mongodb://x']), /Unknown argument/);
  });

  test('registers an existing database: active, all modules, current templates, audited, database only read', async () => {
    const { tenant } = await registerExistingTenant({ key: 'Acme', db: 'legacy_acme', name: 'Acme Ltd', inspect });
    assert.equal(tenant.key, 'acme');
    assert.equal(tenant.dbName, 'legacy_acme');
    assert.equal(tenant.status, 'active');
    assert.deepEqual(tenant.enabledModules, [...MODULES]);
    assert.deepEqual(tenant.roleTemplateKeys, ['tenant_admin', 'viewer'], 'retired templates left out');
    assert.deepEqual(inspected, ['legacy_acme']);
    assert.equal(platform.PlatformAuditLog.docs[0].action, 'tenant.register');
  });

  test('refused: bad key, taken key or database, missing or empty database; nothing written', async () => {
    platform.Tenant.docs.push({ _id: new mongoose.Types.ObjectId(), key: 'taken', dbName: 'taken_db' });
    const cases = [
      [{ key: 'api', db: 'x_db', name: 'X' }, /reserved/],
      [{ key: '1abc', db: 'x_db', name: 'X' }, /--key/],
      [{ key: 'good', db: 'Bad-Name', name: 'X' }, /--db/],
      [{ key: 'good', db: 'x_db', name: '' }, /--name is required/],
      [{ key: 'taken', db: 'x_db', name: 'X' }, /already registered/],
      [{ key: 'good', db: 'taken_db', name: 'X' }, /already registered to company "taken"/],
      [{ key: 'good', db: 'empty_db', name: 'X' }, /does not exist or is empty/],
    ];
    for (const [args, pattern] of cases) {
      await assert.rejects(registerExistingTenant({ ...args, inspect }), pattern, JSON.stringify(args));
    }
    assert.equal(platform.Tenant.docs.length, 1);
    assert.equal(platform.PlatformAuditLog.docs.length, 0);
  });
});
