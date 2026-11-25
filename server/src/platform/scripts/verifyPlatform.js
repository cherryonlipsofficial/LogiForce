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
 * Section 8 checks the tenant lookup (config/tenants.js, middleware/tenant.js,
 * platform/tenantJobs.js). By default it only reads: the middleware runs
 * against a stub instead of opening tenant connections, and a platform outage
 * is simulated by closing this process's own platform connection.
 * VERIFY_TENANT_WRITES=1 adds checks that briefly suspend a company in the
 * platform DB (restored afterwards) and run the three scheduled jobs for real.
 * Use it locally or on staging only, never against production.
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
    const { tenants } = require('./legacyTenants');
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

  await runTenantLookupChecks();
};

// ── 8. Tenant lookup (Step 2) ──

const fs = require('fs');
const path = require('path');

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });
const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));

/** Copy everything this process writes to stdout/stderr, for the log checks. */
const captureOutput = () => {
  const chunks = [];
  const originals = { out: process.stdout.write, err: process.stderr.write };
  process.stdout.write = function write(chunk, ...rest) {
    chunks.push(String(chunk));
    return originals.out.call(process.stdout, chunk, ...rest);
  };
  process.stderr.write = function write(chunk, ...rest) {
    chunks.push(String(chunk));
    return originals.err.call(process.stderr, chunk, ...rest);
  };
  return {
    text: () => chunks.join(''),
    stop: () => {
      process.stdout.write = originals.out;
      process.stderr.write = originals.err;
    },
  };
};
const output = captureOutput(); // started at load, so section 8 sees the whole run

/** Passwords inside any mongodb:// URI in the environment. */
const passwordsInEnv = () => {
  const secrets = new Set();
  for (const value of Object.values(process.env)) {
    const match = /^mongodb(?:\+srv)?:\/\/[^:@/]+:([^@/]+)@/.exec(value || '');
    if (match) {
      secrets.add(match[1]);
      try { secrets.add(decodeURIComponent(match[1])); } catch { /* keep the raw form */ }
    }
  }
  return [...secrets].filter((s) => s.length >= 4);
};

/** Number of queries on the 'tenants' collection while fn runs. */
const countTenantQueries = async (fn) => {
  let count = 0;
  mongoose.set('debug', (collectionName) => {
    if (collectionName === 'tenants') count += 1;
  });
  try {
    await fn();
  } finally {
    mongoose.set('debug', false);
  }
  return count;
};

/** Collection names per legacy tenant database (raw connections, read-only). */
const snapshotTenantCollections = async () => {
  const { tenants } = require('./legacyTenants');
  const snapshot = {};
  for (const [key, tenantConfig] of Object.entries(tenants)) {
    if (!tenantConfig.dbUri) continue;
    const tenantConn = await openRawConnection(tenantConfig.dbUri);
    try {
      snapshot[key] = (await tenantConn.db.listCollections().toArray()).map((c) => c.name).sort();
    } finally {
      await tenantConn.close();
    }
  }
  return snapshot;
};
let collectionsAtStart = null;

/** .js files under server/, without node_modules. */
const listServerJsFiles = (dir, out = []) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'logs' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) listServerJsFiles(full, out);
    else if (entry.name.endsWith('.js')) out.push(full);
  }
  return out;
};

const runTenantLookupChecks = async () => {
  // tenantJobs captures the real getConnectionForTenant when it loads; load it
  // before the middleware checks swap in a stub.
  const jobs = require('../tenantJobs');
  const lookup = require('../../config/tenants');
  const connectionManager = require('../../config/connectionManager');
  const { resolveTenant } = require('../../middleware/tenant');
  const { checkLegacyTenantRecords, printReport } = require('./checkTenants');
  const { getTenantBySubdomain, invalidateTenantCache, listActiveTenants } = lookup;
  const writesAllowed = process.env.VERIFY_TENANT_WRITES === '1';
  const Tenant = () => getPlatformModels().Tenant; // re-read: 8g reconnects

  // The middleware runs against this stub, so no tenant connection is opened.
  const realGetConnection = connectionManager.getConnectionForTenant;
  const opened = [];
  connectionManager.getConnectionForTenant = async (tenantConfig) => {
    opened.push(tenantConfig.key);
    return { stubConnectionFor: tenantConfig.key };
  };

  const runMiddleware = async (tenantId) => {
    const req = { headers: tenantId === undefined ? {} : { 'x-tenant-id': tenantId } };
    const res = {
      statusCode: null,
      body: null,
      headersSent: false,
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; this.headersSent = true; return this; },
    };
    let passed = false;
    await resolveTenant(req, res, () => { passed = true; });
    return { passed, status: res.statusCode, body: res.body, req };
  };
  const expectPass = async (key, label) => {
    const r = await runMiddleware(key);
    assert(r.passed, `${label}: expected next(), got ${r.status} ${JSON.stringify(r.body)}`);
    assert(r.req.tenant && r.req.tenant.key === key, `${label}: req.tenant is ${r.req.tenant?.key}`);
    assert(r.req.dbConnection?.stubConnectionFor === key, `${label}: req.dbConnection not set`);
    return r;
  };
  const expectResponse = async (key, status, body, label) => {
    const r = await runMiddleware(key);
    assert(!r.passed, `${label}: next() was called`);
    assert(r.status === status && JSON.stringify(r.body) === JSON.stringify(body),
      `${label}: got ${r.status} ${JSON.stringify(r.body)}, expected ${status} ${JSON.stringify(body)}`);
  };

  try {
    const active = await Tenant().find({ status: 'active' }).sort({ key: 1 }).lean();
    const [sample, other] = active;

    await check('8a. pre-deploy: every legacy company is active and resolves to the database it uses today', async () => {
      const result = await checkLegacyTenantRecords();
      printReport(result, (line) => console.log(`      ${line}`));
      assert(result.problems.length === 0, result.problems.join('; '));
    });

    if (!sample || !other) {
      console.log('SKIP  8b–8h need at least two active companies in the platform DB');
    } else {
      await check('8b. lookup returns the tenantConfig shape, normalises the key, never serialises the URI', async () => {
        invalidateTenantCache();
        const t = await getTenantBySubdomain(`  ${sample.key.toUpperCase()} `);
        assert(t && t.key === sample.key, `got ${t && t.key}`);
        const want = ['allowSelfSignup', 'dbName', 'enabledModules', 'key', 'limits', 'name',
          'roleTemplateKeys', 'status', 'tenantId'];
        assert(sameSet(Object.keys(t).sort(), want), `enumerable keys: ${Object.keys(t).join(', ')}`);
        assert(typeof t.dbUri === 'string' && t.dbUri.length > 0, 'dbUri missing');
        assert(t.tenantId === String(sample._id) && t.dbName === sample.dbName && t.status === 'active', 'fields differ from the record');
        assert(!/mongodb/i.test(JSON.stringify(t)), 'JSON.stringify(tenantConfig) contains a URI');
        assert(Object.isFrozen(t) && Object.isFrozen(t.enabledModules), 'cached tenantConfig is mutable');
      });

      await check('8c. invalid ids return null without a query; unknown keys: one query, then cached; same responses as before', async () => {
        invalidateTenantCache();
        const invalid = ['AB', '', 'x'.repeat(50), null, undefined, '-abc', 'a b', 'ab'];
        const n = await countTenantQueries(async () => {
          for (const id of invalid) {
            assert(await getTenantBySubdomain(id) === null, `${JSON.stringify(id)} did not return null`);
          }
        });
        assert(n === 0, `${n} query(ies) for invalid ids`);

        const unknownKey = `zz-nope-${randomSuffix()}`;
        const m = await countTenantQueries(async () => {
          assert(await getTenantBySubdomain(unknownKey) === null, 'unknown key did not return null');
          assert(await getTenantBySubdomain(unknownKey) === null, 'unknown key did not return null (cached)');
        });
        assert(m === 1, `${m} queries for an unknown key looked up twice, expected 1`);

        await expectResponse(unknownKey, 404, { success: false, message: `Unknown tenant: ${unknownKey}` }, 'unknown key');
        await expectResponse('AB', 404, { success: false, message: 'Unknown tenant: AB' }, '"AB"');
        await expectResponse('x'.repeat(50), 404, { success: false, message: `Unknown tenant: ${'x'.repeat(50)}` }, 'x*50');
        await expectResponse('', 400, { success: false, message: 'Tenant could not be determined. Use x-tenant-id header.' }, 'empty header');
        await expectResponse(undefined, 400, { success: false, message: 'Tenant could not be determined. Use x-tenant-id header.' }, 'no header');
      });

      await check('8d. 50 concurrent lookups on an empty cache make exactly one query', async () => {
        invalidateTenantCache();
        let results = [];
        const n = await countTenantQueries(async () => {
          results = await Promise.all(Array.from({ length: 50 }, () => getTenantBySubdomain(sample.key)));
        });
        assert(n === 1, `${n} queries to 'tenants', expected 1`);
        assert(results.every((r) => r === results[0] && r.key === sample.key), 'callers got different results');
      });

      await check('8e. middleware passes active companies through with req.tenant and the connection', async () => {
        invalidateTenantCache();
        for (const record of active) {
          await expectPass(record.key, record.key);
        }
      });

      await check('8f. a record whose dbUriEnv is unset: 503 for that company only, skipped by listActiveTenants', async () => {
        const victim = active.find((r) => r.dbUriEnv && active.some((o) => o.key !== r.key && o.dbUriEnv !== r.dbUriEnv));
        assert(victim, 'no active record with dbUriEnv to test with');
        const bystander = active.find((r) => r.key !== victim.key && r.dbUriEnv !== victim.dbUriEnv);
        const before = (await listActiveTenants()).map((t) => t.key);
        const saved = process.env[victim.dbUriEnv];
        const mark = output.text().length;
        delete process.env[victim.dbUriEnv];
        try {
          invalidateTenantCache();
          await rejects(() => getTenantBySubdomain(victim.key),
            new RegExp(`^Tenant ${victim.key}: env ${victim.dbUriEnv} is not set$`), 'lookup');
          opened.length = 0;
          await expectResponse(victim.key, 503, { success: false, message: 'Service temporarily unavailable' }, victim.key);
          assert(!opened.includes(victim.key), 'a connection was opened for it');
          await expectPass(bystander.key, `${bystander.key} (unaffected)`);
          const after = (await listActiveTenants()).map((t) => t.key);
          assert(sameSet(after, before.filter((k) => k !== victim.key)), `listActiveTenants returned ${after.join(', ')}`);
          assert(output.text().slice(mark).includes(`[Tenants] Skipping tenant ${victim.key}: Tenant ${victim.key}: env ${victim.dbUriEnv} is not set`),
            'no error log for the skipped record');
        } finally {
          process.env[victim.dbUriEnv] = saved;
          invalidateTenantCache();
        }
      });

      await check('8g. forEachActiveTenant visits each active company once, isolates failures, never rejects', async () => {
        const expected = (await listActiveTenants()).map((t) => t.key);
        const visited = [];
        const summary = await jobs.forEachActiveTenant('Verify', async (t) => {
          visited.push(t.key);
          if (t.key === other.key) throw new Error('deliberate failure');
        });
        assert(summary.loaded, 'tenants were not loaded');
        assert(JSON.stringify(visited) === JSON.stringify(expected), `visited ${visited.join(', ')}`);
        assert(sameSet(summary.failed, [other.key]), `failed: ${summary.failed.join(', ')}`);
        assert(sameSet(summary.done, expected.filter((k) => k !== other.key)), `done: ${summary.done.join(', ')}`);
        assert(output.text().includes(`[Cron] Verify failed for ${other.key}: deliberate failure`), 'failure not logged');
      });

      if (writesAllowed) {
        await check('8h. [writes] suspend: 403 TENANT_SUSPENDED, no connection, others unaffected, jobs skip it, TTL expiry', async () => {
          const target = active.find((r) => r.key === process.env.VERIFY_SUSPEND_TENANT) || other;
          const bystander = active.find((r) => r.key !== target.key);
          const suspended = { success: false, message: 'Account suspended', code: 'TENANT_SUSPENDED' };
          const savedTtl = process.env.TENANT_CACHE_TTL_MS;
          try {
            invalidateTenantCache();
            await expectPass(target.key, 'before suspending');
            await Tenant().updateOne({ _id: target._id }, { $set: { status: 'suspended' } });
            await expectPass(target.key, 'suspended, cached as active (TTL not expired)');
            invalidateTenantCache(target.key);
            opened.length = 0;
            await expectResponse(target.key, 403, suspended, 'suspended after invalidate');
            assert(!opened.includes(target.key), 'a connection was opened for the suspended company');
            await expectPass(bystander.key, `${bystander.key} (unaffected)`);

            const expected = (await listActiveTenants()).map((t) => t.key);
            assert(!expected.includes(target.key), 'listActiveTenants still lists the suspended company');
            for (const [name, job] of [['expiry check', jobs.runExpiryCheck], ['ledger cleanup', jobs.runLedgerCleanup],
              ['salary reminder', jobs.runSalaryReminder]]) {
              const s = await job();
              assert(s.loaded && s.failed.length === 0, `${name}: loaded=${s.loaded} failed=${s.failed.join(', ')}`);
              assert(sameSet(s.done, expected), `${name} ran for ${s.done.join(', ')}, expected ${expected.join(', ')}`);
            }

            await Tenant().updateOne({ _id: target._id }, { $set: { status: 'active' } });
            invalidateTenantCache(target.key);
            await expectPass(target.key, 'reactivated after invalidate');

            // Without invalidating, the change appears once the TTL expires (short TTL here).
            process.env.TENANT_CACHE_TTL_MS = '1500';
            invalidateTenantCache();
            await expectPass(target.key, 'cached as active');
            await Tenant().updateOne({ _id: target._id }, { $set: { status: 'suspended' } });
            await expectPass(target.key, 'suspended in DB, still cached');
            await sleep(1700);
            await expectResponse(target.key, 403, suspended, 'after TTL expiry');
          } finally {
            await Tenant().updateOne({ _id: target._id }, { $set: { status: target.status } });
            if (savedTtl === undefined) delete process.env.TENANT_CACHE_TTL_MS;
            else process.env.TENANT_CACHE_TTL_MS = savedTtl;
            invalidateTenantCache();
          }
          const restored = await Tenant().findById(target._id).lean();
          assert(restored.status === target.status, `status not restored: ${restored.status}`);
        });
      } else {
        console.log('SKIP  8h. suspend + scheduled jobs (writes; set VERIFY_TENANT_WRITES=1, never against production)');
      }

      await check('8i. platform DB unreachable: cached key served stale, uncached key 503, jobs skip the run', async () => {
        const savedTtl = process.env.TENANT_CACHE_TTL_MS;
        const mark = output.text().length;
        process.env.TENANT_CACHE_TTL_MS = '0'; // cached records are already expired
        try {
          invalidateTenantCache();
          const fresh = await getTenantBySubdomain(sample.key);
          await closePlatformDb();

          const stale = await getTenantBySubdomain(sample.key);
          assert(stale === fresh, 'the stale record was not returned');
          await expectPass(sample.key, 'cached key while the platform DB is down');
          await rejects(() => getTenantBySubdomain(other.key), /Platform DB is not connected/, 'uncached lookup');
          await expectResponse(other.key, 503, { success: false, message: 'Service temporarily unavailable' }, 'uncached key');
          const s = await jobs.forEachActiveTenant('Verify outage', async () => {});
          assert(!s.loaded && s.done.length === 0, 'job ran without a tenant list');

          const logs = output.text().slice(mark);
          assert(logs.includes(`Platform DB lookup for ${sample.key} failed, serving the cached record`), 'no stale warning');
          assert(logs.includes('[Cron] Verify outage: could not load tenants:'), 'no "could not load tenants" log');
        } finally {
          if (savedTtl === undefined) delete process.env.TENANT_CACHE_TTL_MS;
          else process.env.TENANT_CACHE_TTL_MS = savedTtl;
          await connectPlatformDb();
          invalidateTenantCache();
        }
        await expectPass(other.key, 'after the platform DB is back');
      });
    }

    await check('8j. runtime code: no legacy map, no getAllTenantKeys, every getTenantBySubdomain( is awaited', async () => {
      const serverRoot = path.resolve(__dirname, '../../..');
      const exempt = new Set([path.join(__dirname, 'legacyTenants.js'), __filename]);
      const problems = [];
      for (const file of listServerJsFiles(serverRoot)) {
        if (exempt.has(file)) continue;
        const rel = path.relative(serverRoot, file);
        const lines = fs.readFileSync(file, 'utf8').split('\n');
        lines.forEach((line, i) => {
          if (/Object\.entries\(\s*tenants\s*\)/.test(line)) problems.push(`${rel}:${i + 1} Object.entries(tenants)`);
          if (/getAllTenantKeys/.test(line)) problems.push(`${rel}:${i + 1} getAllTenantKeys`);
          if (/\btenants\b[^\n]*require\([^)]*config\/tenants['"]\)|require\([^)]*config\/tenants['"]\)\.tenants/.test(line)) {
            problems.push(`${rel}:${i + 1} reads the old tenants map`);
          }
          for (const m of line.matchAll(/getTenantBySubdomain\s*\(/g)) {
            if (!/await\s+$/.test(line.slice(0, m.index))) problems.push(`${rel}:${i + 1} getTenantBySubdomain( not awaited`);
          }
        });
      }
      assert(problems.length === 0, problems.join('; '));
    });

    await check('8k. no tenant database gained a collection during this run', async () => {
      assert(collectionsAtStart, 'no snapshot from the start of the run');
      const now = await snapshotTenantCollections();
      for (const [key, names] of Object.entries(collectionsAtStart)) {
        const added = (now[key] || []).filter((n) => !names.includes(n));
        assert(added.length === 0, `${key}: new collection(s) ${added.join(', ')}`);
      }
    });
  } finally {
    connectionManager.getConnectionForTenant = realGetConnection;
  }

  await check('8l. no output line contains a MongoDB URI or a password', async () => {
    const text = output.text();
    assert(!/mongodb(?:\+srv)?:\/\//i.test(text), 'a MongoDB URI was printed');
    const leaked = passwordsInEnv().filter((secret) => text.includes(secret));
    assert(leaked.length === 0, `${leaked.length} password(s) from the environment were printed`);
  });
};

(async () => {
  try {
    collectionsAtStart = await snapshotTenantCollections();
  } catch (err) {
    console.log(`NOTE  could not snapshot tenant databases (8k will fail): ${err.message}`);
  }
  try {
    await run();
  } catch (err) {
    failures += 1;
    console.log(`FAIL  verify aborted: ${err.message}`);
  }
  await require('../../config/connectionManager').closeAllConnections().catch(() => {});
  await closePlatformDb().catch(() => {});
  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
})();
