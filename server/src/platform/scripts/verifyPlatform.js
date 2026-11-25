/**
 * Verify the platform database layer.  npm run platform:verify
 *
 * Uses the same env as the server (PLATFORM_MONGODB_URI, tenant MONGODB_URI_* ...).
 * It runs the platform seed twice (that is part of the check), creates two
 * throwaway documents (a RoleTemplate and a PlatformUser with random keys) and
 * deletes them again. It never writes to the audit log beyond what the seed
 * itself records, and never writes to a tenant database.
 *
 * Optional live API check (item 7) against a running server:
 *   VERIFY_API_URL=http://localhost:5000 VERIFY_TENANT=logi-force \
 *   VERIFY_EMAIL=admin@logiforce.com VERIFY_PASSWORD=... npm run platform:verify
 *
 * Prints PASS/FAIL per check; exits 1 if anything fails.
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });

const crypto = require('crypto');
const mongoose = require('mongoose');
const { connectPlatformDb, closePlatformDb, getPlatformConnection, getPlatformDbName } = require('../db');
const { getPlatformModels, PLATFORM_MODELS } = require('../models');
const { stripSensitive, APPEND_ONLY_MESSAGE } = require('../models/PlatformAuditLog');
const { seedPlatform, printSummary, resolveLegacyTenant } = require('./seedPlatform');
const { MODULES } = require('../../config/permissions');

const EXPECTED_INDEXES = {
  tenants: [
    { key: { key: 1 }, unique: true },
    { key: { dbName: 1 }, unique: true },
    { key: { status: 1 } },
  ],
  role_templates: [{ key: { key: 1 }, unique: true }],
  platform_users: [{ key: { email: 1 }, unique: true }],
  platform_audit_logs: [
    { key: { createdAt: -1 } },
    { key: { targetType: 1, targetId: 1, createdAt: -1 } },
    { key: { 'actor.userId': 1, createdAt: -1 } },
  ],
};

let failures = 0;
const check = async (name, fn) => {
  try {
    await fn();
    console.log(`PASS  ${name}`);
  } catch (err) {
    failures += 1;
    console.log(`FAIL  ${name}\n      ${err.message}`);
  }
};

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const rejects = async (fn, pattern, label) => {
  try {
    await fn();
  } catch (err) {
    assert(pattern.test(err.message), `${label}: threw "${err.message}", expected ${pattern}`);
    return;
  }
  throw new Error(`${label}: did not throw`);
};

/** Validation errors keyed by path ({} when valid). Never writes. */
const validationErrors = async (doc) => {
  try {
    await doc.validate();
    return {};
  } catch (err) {
    if (!err.errors) throw err;
    return err.errors;
  }
};

const randomSuffix = () => crypto.randomBytes(4).toString('hex');

const openRawConnection = (uri) => mongoose.createConnection(uri, {
  ...(uri.startsWith('mongodb+srv://') ? { tls: true, tlsAllowInvalidCertificates: false } : {}),
  serverSelectionTimeoutMS: 5000,
}).asPromise();

const run = async () => {
  await connectPlatformDb();
  const conn = getPlatformConnection();
  const models = getPlatformModels();
  const { Tenant, RoleTemplate, PlatformUser, PlatformAuditLog } = models;
  const quiet = () => {};

  console.log(`Platform database: ${getPlatformDbName()}\n`);

  // ── 1. Seed is idempotent ──
  await check('1. seed twice: second run creates and updates nothing', async () => {
    const first = await seedPlatform({ log: quiet });
    console.log('      run 1:');
    printSummary(first, (line) => line.trim() && console.log(`      ${line.trim()}`));
    const second = await seedPlatform({ log: quiet });
    console.log('      run 2:');
    printSummary(second, (line) => line.trim() && console.log(`      ${line.trim()}`));
    const dirty = Object.entries(second).filter(([, c]) => c.created || c.updated);
    assert(dirty.length === 0, `second run changed: ${dirty.map(([n, c]) => `${n} ${JSON.stringify(c)}`).join('; ')}`);
  });

  // ── 2. Collections and indexes ──
  await check('2. platform DB has the 4 collections with the expected indexes', async () => {
    const existing = new Set((await conn.db.listCollections().toArray()).map((c) => c.name));
    for (const { collection } of PLATFORM_MODELS) {
      assert(existing.has(collection), `collection ${collection} is missing`);
      const indexes = await conn.db.collection(collection).indexes();
      for (const want of EXPECTED_INDEXES[collection]) {
        const found = indexes.find((ix) => JSON.stringify(ix.key) === JSON.stringify(want.key));
        assert(found, `${collection}: index ${JSON.stringify(want.key)} is missing`);
        assert(!!found.unique === !!want.unique,
          `${collection}: index ${JSON.stringify(want.key)} unique=${!!found.unique}, expected ${!!want.unique}`);
      }
    }
  });

  // ── 3. Validation ──
  await check('3a. Tenant key "ab" is rejected', async () => {
    const errors = await validationErrors(new Tenant({ key: 'ab', name: 'Too short' }));
    assert(errors.key, 'no error on key');
  });
  await check('3b. Tenant key "www" is rejected (reserved)', async () => {
    const errors = await validationErrors(new Tenant({ key: 'www', name: 'Reserved' }));
    assert(errors.key && /reserved/.test(errors.key.message), `unexpected: ${errors.key?.message}`);
  });
  await check('3c. Tenant enabledModules ["Nope"] is rejected and the error names it', async () => {
    const errors = await validationErrors(new Tenant({ key: 'acme-co', name: 'Acme', enabledModules: ['Drivers', 'Nope'] }));
    assert(errors.enabledModules, 'no error on enabledModules');
    assert(/Nope/.test(errors.enabledModules.message) && !/Drivers/.test(errors.enabledModules.message),
      `message should list only the bad value: ${errors.enabledModules.message}`);
  });
  await check('3d. RoleTemplate with an unknown permission is rejected', async () => {
    const errors = await validationErrors(new RoleTemplate({
      key: 'bad_role', displayName: 'Bad', permissions: ['drivers.view', 'drivers.fly', 'toString'],
    }));
    assert(errors.permissions, 'no error on permissions');
    assert(/drivers\.fly/.test(errors.permissions.message) && /toString/.test(errors.permissions.message),
      `message should list the bad keys: ${errors.permissions.message}`);
  });
  await check('3e. Tenant defaults and other guards (dbName default, dedupe, reserved DBs, dbUriEnv)', async () => {
    const ok = new Tenant({ key: 'Acme-Co ', name: ' Acme ', enabledModules: ['Drivers', 'Drivers'], roleTemplateKeys: ['ops', 'ops'] });
    const okErrors = await validationErrors(ok);
    assert(Object.keys(okErrors).length === 0, `valid tenant failed: ${Object.keys(okErrors).join(', ')}`);
    assert(ok.key === 'acme-co', `key not normalised: ${ok.key}`);
    assert(ok.dbName === 'logiforce_acme_co', `dbName default: ${ok.dbName}`);
    assert(ok.enabledModules.length === 1 && ok.roleTemplateKeys.length === 1, 'duplicates not removed');
    assert(ok.status === 'provisioning' && ok.allowSelfSignup === false && ok.limits.maxUsers === null, 'defaults wrong');
    for (const dbName of ['admin', 'local', 'config', getPlatformDbName()]) {
      const errors = await validationErrors(new Tenant({ key: 'acme-co', name: 'Acme', dbName }));
      assert(errors.dbName, `dbName "${dbName}" was accepted`);
    }
    const uriErrors = await validationErrors(new Tenant({ key: 'acme-co', name: 'Acme', dbUriEnv: 'mongodb://h/x' }));
    assert(uriErrors.dbUriEnv, 'a URI was accepted as dbUriEnv');
    const allModules = await validationErrors(new Tenant({ key: 'acme-co', name: 'Acme', enabledModules: [...MODULES] }));
    assert(!allModules.enabledModules, 'MODULES itself failed validation');
  });

  // ── 4. RoleTemplate versioning ──
  await check('4. changing a template\'s permissions with save() moves version 1 → 2', async () => {
    const key = `zz_verify_${randomSuffix()}`;
    try {
      const doc = await RoleTemplate.create({ key, displayName: 'Verify', permissions: ['drivers.view'] });
      assert(doc.version === 1, `new template version ${doc.version}`);

      doc.displayName = 'Verify (renamed)';
      await doc.save();
      assert(doc.version === 1, `a non-permission edit changed version to ${doc.version}`);

      doc.permissions = ['drivers.view', 'drivers.edit', 'drivers.edit'];
      await doc.save();
      const reloaded = await RoleTemplate.findById(doc._id);
      assert(reloaded.version === 2, `version after permission change: ${reloaded.version}`);
      assert(reloaded.permissions.length === 2, 'duplicate permission was not removed');

      await rejects(() => RoleTemplate.updateOne({ key }, { $set: { permissions: ['drivers.view'] } }),
        /doc\.save\(\)/, 'updateOne on permissions');
      await rejects(() => RoleTemplate.findOneAndUpdate({ key }, { $addToSet: { permissions: 'drivers.delete' } }),
        /doc\.save\(\)/, 'findOneAndUpdate on permissions');
    } finally {
      await RoleTemplate.deleteOne({ key });
    }
  });

  // ── 5. Audit log is append-only ──
  await check('5. PlatformAuditLog updates and deletes all throw', async () => {
    const before = await PlatformAuditLog.countDocuments();
    const entry = await PlatformAuditLog.findOne();
    assert(entry, 'no audit entries to test against (did the seed run?)');
    const original = entry.action;
    const id = entry._id;
    const ops = {
      'Model.updateOne': () => PlatformAuditLog.updateOne({ _id: id }, { $set: { action: 'tampered' } }),
      'Model.deleteOne': () => PlatformAuditLog.deleteOne({ _id: id }),
      'Model.updateMany': () => PlatformAuditLog.updateMany({}, { $set: { action: 'tampered' } }),
      'Model.deleteMany': () => PlatformAuditLog.deleteMany({}),
      'Model.findOneAndUpdate': () => PlatformAuditLog.findOneAndUpdate({ _id: id }, { action: 'tampered' }),
      'Model.findOneAndDelete': () => PlatformAuditLog.findOneAndDelete({ _id: id }),
      'Model.replaceOne': () => PlatformAuditLog.replaceOne({ _id: id }, { action: 'tampered' }),
      'Model.bulkWrite(updateOne)': () => PlatformAuditLog.bulkWrite([
        { updateOne: { filter: { _id: id }, update: { $set: { action: 'tampered' } } } },
      ]),
      'doc.updateOne': () => entry.updateOne({ action: 'tampered' }),
      'doc.deleteOne': () => entry.deleteOne(),
      'doc.save (existing)': () => { entry.action = 'tampered'; return entry.save(); },
    };
    for (const [label, op] of Object.entries(ops)) {
      await rejects(op, new RegExp(APPEND_ONLY_MESSAGE), label);
    }
    const after = await PlatformAuditLog.countDocuments();
    const reloaded = await PlatformAuditLog.findById(id).lean();
    assert(after === before, `entry count changed ${before} → ${after}`);
    assert(reloaded && reloaded.action === original, 'an entry was modified');
  });
  await check('5b. audit snapshots drop password / token fields at any depth', async () => {
    const out = stripSensitive({
      email: 'a@b.co', password: 'x', passwordHash: 'x', token: 'x',
      nested: { refreshToken: 'x', keep: 1, list: [{ password: 'x', ok: true }] },
      id: new mongoose.Types.ObjectId(),
    });
    assert(out.email && out.nested.keep === 1 && out.nested.list[0].ok === true, 'kept fields were lost');
    assert(out.id instanceof mongoose.Types.ObjectId, 'ObjectId was not preserved');
    const flat = JSON.stringify(out);
    assert(!/password|token/i.test(flat), `sensitive key survived: ${flat}`);
  });

  // ── 6. PlatformUser password handling ──
  await check('6. PlatformUser hides passwordHash and comparePassword works', async () => {
    const email = `verify-${randomSuffix()}@example.invalid`;
    const password = `Pw-${crypto.randomBytes(12).toString('hex')}`;
    try {
      const shortPw = new PlatformUser({ email, name: 'Verify' });
      await rejects(() => shortPw.setPassword('short'), /at least 12/, 'setPassword("short")');

      const user = new PlatformUser({ email, name: 'Verify' });
      await user.setPassword(password);
      await user.save();
      assert(user.role === 'support' && user.status === 'active', 'role/status defaults wrong');

      const plain = await PlatformUser.findOne({ email });
      assert(plain.passwordHash === undefined, 'findOne() returned passwordHash');
      const json = plain.toJSON();
      assert(!('passwordHash' in json) && !('__v' in json), 'toJSON leaked passwordHash or __v');
      await rejects(() => plain.comparePassword(password), /select\('\+passwordHash'\)/, 'comparePassword without select');

      const withHash = await PlatformUser.findOne({ email }).select('+passwordHash');
      assert(/^\$2[aby]\$12\$/.test(withHash.passwordHash), 'hash is not bcrypt with 12 rounds');
      assert(await withHash.comparePassword(password) === true, 'correct password rejected');
      assert(await withHash.comparePassword(`${password}x`) === false, 'wrong password accepted');
      assert(!('passwordHash' in withHash.toJSON()), 'toJSON leaked passwordHash when selected');
    } finally {
      await PlatformUser.deleteOne({ email });
    }
  });

  // ── 7. Tenants untouched ──
  await check('7a. no platform model is registered on the default connection or the tenant registry', async () => {
    const { schemas } = require('../../config/modelRegistry');
    for (const { name } of PLATFORM_MODELS) {
      assert(!(name in schemas), `${name} is in config/modelRegistry.js`);
      assert(!mongoose.modelNames().includes(name), `${name} is registered with mongoose.model()`);
    }
  });

  await check('7b. tenant records match the databases in use, and no tenant DB holds platform collections', async () => {
    const { tenants } = require('../../config/tenants');
    const platformNames = new Set(PLATFORM_MODELS.map((m) => m.collection));
    let inspected = 0;
    for (const [key, tenantConfig] of Object.entries(tenants)) {
      const live = resolveLegacyTenant(key, tenantConfig);
      if (!live.dbName) {
        console.log(`      ${key}: no URI configured here, not inspected`);
        continue;
      }
      assert(live.dbName !== getPlatformDbName(), `tenant ${key} uses the platform database`);

      const record = await Tenant.findOne({ key }).lean();
      assert(record, `tenant ${key} has no platform record`);
      assert(record.dbName === live.dbName, `tenant ${key}: record says ${record.dbName}, URI uses ${live.dbName}`);

      const tenantConn = await openRawConnection(tenantConfig.dbUri);
      try {
        const names = (await tenantConn.db.listCollections().toArray()).map((c) => c.name);
        const leaked = names.filter((n) => platformNames.has(n));
        assert(leaked.length === 0, `tenant DB ${live.dbName} contains ${leaked.join(', ')}`);
      } finally {
        await tenantConn.close();
      }
      inspected += 1;
    }
    assert(inspected > 0, 'no tenant database could be inspected (no tenant URIs configured)');
  });

  const { VERIFY_API_URL, VERIFY_TENANT, VERIFY_EMAIL, VERIFY_PASSWORD } = process.env;
  if (VERIFY_API_URL && VERIFY_TENANT && VERIFY_EMAIL && VERIFY_PASSWORD) {
    await check(`7c. running server: tenant ${VERIFY_TENANT} login and GET /api/drivers`, async () => {
      const base = VERIFY_API_URL.replace(/\/$/, '');
      const health = await fetch(`${base}/api/health`);
      assert(health.ok, `/api/health returned ${health.status}`);
      const login = await fetch(`${base}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-tenant-id': VERIFY_TENANT },
        body: JSON.stringify({ email: VERIFY_EMAIL, password: VERIFY_PASSWORD }),
      });
      const body = await login.json().catch(() => ({}));
      const token = body?.data?.token;
      assert(login.ok && token, `login returned ${login.status}: ${body?.message || ''}`);
      const drivers = await fetch(`${base}/api/drivers`, {
        headers: { 'x-tenant-id': VERIFY_TENANT, Authorization: `Bearer ${token}` },
      });
      assert(drivers.ok, `GET /api/drivers returned ${drivers.status}`);
    });
  } else {
    console.log('SKIP  7c. live API check (set VERIFY_API_URL, VERIFY_TENANT, VERIFY_EMAIL, VERIFY_PASSWORD to run it)');
  }
};

(async () => {
  try {
    await run();
  } catch (err) {
    failures += 1;
    console.log(`FAIL  verify aborted: ${err.message}`);
  }
  await closePlatformDb().catch(() => {});
  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
})();
