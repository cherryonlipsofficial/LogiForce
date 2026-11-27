/**
 * The whole app (src/app.js) with no hardcoded companies (Step 8).  npm test
 *
 * Runs the real createApp(): platform routes, resolveTenant, protect(),
 * provisioning and the scheduled-job loop. Only storage is faked: the platform
 * models are in-memory (test/helpers/fakeDb.js) and each company "database"
 * is a set of in-memory models. No MongoDB is needed.
 */
process.env.NODE_ENV = 'test';
process.env.APP_DOMAIN = 'logiforce.test';
process.env.MONGODB_BASE_URI = 'mongodb://tenant-db.invalid'; // only to build URIs; never opened
process.env.PLATFORM_MONGODB_URI = 'mongodb://platform-db.invalid';
process.env.JWT_SECRET = 'tenant-secret-for-tests-only-000000000000';
process.env.PLATFORM_JWT_SECRET = 'platform-secret-for-tests-only-11111111111';
process.env.EMAIL_DEV_LOG = 'false';
process.env.TENANT_CACHE_TTL_MS = '60000';

const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { makeModel, clone } = require('./helpers/fakeDb');
const { systemRoleDocs, platformUserDoc } = require('./helpers/platformRoles');

// ── Fakes, installed before the app is built ──

const platformModels = require('../src/platform/models');
const platform = {};
platformModels.getPlatformModels = () => platform;

const platformDb = require('../src/platform/db');
platformDb.getPlatformConnection = () => ({ readyState: 1 });

const connectionManager = require('../src/config/connectionManager');
const roleSync = require('../src/platform/services/roleSync.service');
const emailUtils = require('../src/utils/email');
const { schemas } = require('../src/config/modelRegistry');
const { ROLE_TEMPLATES } = require('../src/config/defaultRoles');
const { invalidateTenantCache } = require('../src/config/tenants');
const { signPlatformToken } = require('../src/platform/services/platformAuth.service');
const { generateToken } = require('../src/modules/shared/auth.service');
const tenantJobs = require('../src/platform/tenantJobs');
const logger = require('../src/utils/logger');

const companyDbs = new Map();
const opened = [];
const makeCompanyDb = () => {
  const db = { Role: makeModel([], { unique: ['name'] }), User: makeModel([], { unique: ['email'] }), CompanySettings: makeModel([]) };
  const models = {};
  for (const name of Object.keys(schemas)) {
    models[name] = db[name] || makeModel([]);
    models[name].init = async () => {};
    models[name].syncIndexes = async () => [];
  }
  db.conn = {
    models,
    db: {
      listCollections: () => ({ toArray: async () => [] }),
      collection: () => ({ estimatedDocumentCount: async () => 0 }),
    },
  };
  return db;
};
connectionManager.getConnectionForTenant = async (tenantConfig) => {
  opened.push(tenantConfig.key);
  if (!companyDbs.has(tenantConfig.dbName)) companyDbs.set(tenantConfig.dbName, makeCompanyDb());
  return companyDbs.get(tenantConfig.dbName).conn;
};
// The role sync has its own tests; here it just puts the admin role in place.
roleSync.syncTenantRoles = async (tenant) => {
  const db = companyDbs.get(tenant.dbName);
  if (!db.Role.docs.some((r) => r.templateKey === 'tenant_admin')) {
    await db.Role.create({ name: 'tenant_admin', templateKey: 'tenant_admin', isActive: true, permissions: ['users.view'] });
  }
  return { created: ['tenant_admin'], updated: [], unchanged: [], deactivated: [], conflicts: [], missingTemplates: [], usersOnDeactivatedRoles: 0 };
};
const mail = [];
emailUtils.isEmailConfigured = () => true;
emailUtils.sendPasswordResetEmail = async (m) => { mail.push(m); };

let owner;
let support;
const resetPlatform = () => {
  owner = platformUserDoc('platform_owner', { email: 'owner@platform.test' });
  support = platformUserDoc('platform_support', { email: 'support@platform.test' });
  platform.Tenant = makeModel([], {
    unique: ['key', 'dbName'],
    onCreate: (doc) => {
      doc.dbName = doc.dbName || `logiforce_${doc.key.replace(/-/g, '_')}`;
      doc.status = doc.status || 'provisioning';
    },
  });
  platform.Tenant.db = { readyState: 1 }; // config/tenants.js checks the connection before querying
  platform.RoleTemplate = makeModel(ROLE_TEMPLATES.map((t) => ({ ...clone({ ...t, permissions: [...t.permissions] }), version: 1 })));
  platform.PlatformRole = makeModel(systemRoleDocs());
  platform.PlatformUser = makeModel([owner, support]);
  platform.PlatformLoginChallenge = makeModel([]);
  platform.PlatformAuditLog = makeModel([]);
  platform.PlatformAuditLog.record = async ({ req, ...e }) => { platform.PlatformAuditLog.docs.push(clone(e)); };
  companyDbs.clear();
  opened.length = 0;
  mail.length = 0;
  invalidateTenantCache();
};

let server;
let base;
const call = async (method, urlPath, { body, token, headers = {} } = {}) => {
  const h = { 'content-type': 'application/json', ...headers };
  if (token) h.authorization = `Bearer ${token}`;
  const res = await fetch(`${base}${urlPath}`, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json().catch(() => null) };
};
const writes = () => Object.values(platform).reduce((n, m) => n + (m.writes || 0), 0);

const realLogger = { error: logger.error, info: logger.info, warn: logger.warn };
before(async () => {
  logger.error = () => {};
  logger.info = () => {};
  logger.warn = () => {};
  const { createApp } = require('../src/app');
  const app = createApp();
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  Object.assign(logger, realLogger);
  await new Promise((resolve) => server.close(resolve));
});
beforeEach(resetPlatform);

const NEW_TENANT = {
  key: 'acme', name: 'Acme Ltd', adminName: 'Ada', adminEmail: 'ada@acme.test',
  enabledModules: ['Drivers'], roleTemplateKeys: ['viewer'],
};

describe('a fresh install', () => {
  test('zero companies: the server builds, is healthy, lists nothing, and writes nothing', async () => {
    const { startupEnvProblems } = require('../src/app');
    assert.deepEqual(startupEnvProblems(), []);

    const health = await call('GET', '/api/health');
    assert.equal(health.status, 200);
    assert.equal(health.body.platformDb, 'connected');

    const list = await call('GET', '/api/platform/tenants', { token: signPlatformToken(owner) });
    assert.deepEqual(list.body.tenants, []);

    // Any company key is unknown.
    const unknown = await call('GET', '/api/drivers', { headers: { 'x-tenant-id': 'logi-force' } });
    assert.equal(unknown.status, 404);
    assert.equal(unknown.body.code, 'TENANT_NOT_FOUND');

    // The startup job loop finds nothing to do.
    const summary = await tenantJobs.runStartupLedgerCleanup();
    assert.deepEqual(summary, { loaded: true, done: [], failed: [] });
    assert.equal(writes(), 0, 'starting up created nothing');
    assert.deepEqual(opened, [], 'no company database was opened');
  });

  test('server.js refuses to start without the platform database, base URI or domain, and says why', () => {
    const run = (unset) => {
      const env = { ...process.env, NODE_ENV: 'test' };
      for (const k of unset) delete env[k];
      return spawnSync(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..'), env, encoding: 'utf8', timeout: 20000 });
    };
    const noPlatform = run(['PLATFORM_MONGODB_URI']);
    assert.equal(noPlatform.status, 1);
    assert.match(noPlatform.stderr, /PLATFORM_MONGODB_URI is not set/);
    const noBase = run(['MONGODB_BASE_URI', 'APP_DOMAIN']);
    assert.equal(noBase.status, 1);
    assert.match(noBase.stderr, /MONGODB_BASE_URI is not set/);
    assert.match(noBase.stderr, /APP_DOMAIN is not set/);
  });
});

describe('nothing seeds on start or deploy', () => {
  test('no npm lifecycle hook runs a script; start is just the server', () => {
    const { scripts } = require('../package.json');
    assert.equal(scripts.start, 'node server.js');
    for (const hook of ['prestart', 'poststart', 'preinstall', 'install', 'postinstall', 'prepare', 'predeploy', 'postdeploy']) {
      assert.equal(scripts[hook], undefined, hook);
    }
    const dockerfile = fs.readFileSync(path.join(__dirname, '..', 'Dockerfile'), 'utf8');
    assert.match(dockerfile, /CMD \["node", "server.js"\]/);
    assert.doesNotMatch(dockerfile, /seed|create-owner|register-tenant/i);
  });

  test('seed:demo refuses NODE_ENV=production and needs --tenant', () => {
    const run = (args, nodeEnv) => spawnSync(process.execPath, ['src/scripts/seedDemo.js', ...args], {
      cwd: path.join(__dirname, '..'), env: { ...process.env, NODE_ENV: nodeEnv }, encoding: 'utf8', timeout: 20000,
    });
    const prod = run(['--tenant=acme'], 'production');
    assert.equal(prod.status, 1);
    assert.match(prod.stderr, /refuses to run with NODE_ENV=production/);
    const noTenant = run([], 'development');
    assert.equal(noTenant.status, 1);
    assert.match(noTenant.stderr, /--tenant=<key>/);
  });
});

describe('companies come and go without a restart', () => {
  test('an Owner creates a company; it is served at its subdomain at once', async () => {
    // Before: unknown (and that answer is cached).
    const before = await call('GET', '/api/drivers', { headers: { origin: 'https://acme.logiforce.test' } });
    assert.equal(before.status, 404);

    const created = await call('POST', '/api/platform/tenants', { token: signPlatformToken(owner), body: NEW_TENANT });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.equal(created.body.tenant.status, 'active');
    assert.equal(created.body.tenant.url, 'https://acme.logiforce.test');
    assert.match(mail[0].resetUrl, /^https:\/\/acme\.logiforce\.test\/reset-password\/[a-f0-9]{64}$/);

    // After: resolved from the Origin subdomain (no x-tenant-id), reaches protect().
    const after = await call('GET', '/api/drivers', { headers: { origin: 'https://acme.logiforce.test' } });
    assert.equal(after.status, 401, JSON.stringify(after.body));
    assert.equal(after.body.message, 'No token, authorization denied');
    assert.ok(opened.includes('acme'));

    // A subdomain of some other domain is not a company. (Referer, because CORS
    // already refuses a foreign Origin before tenant resolution.)
    const foreign = await call('GET', '/api/drivers', { headers: { referer: 'https://acme.example.com/drivers' } });
    assert.equal(foreign.status, 400);
  });

  test('Support cannot create a company', async () => {
    const res = await call('POST', '/api/platform/tenants', { token: signPlatformToken(support), body: NEW_TENANT });
    assert.equal(res.status, 403);
    assert.equal(platform.Tenant.docs.length, 0);
  });

  test('provisioning → 503, suspended and archived → 403, and the jobs skip all three', async () => {
    const t = (key, status) => ({ _id: new mongoose.Types.ObjectId(), key, name: key, dbName: `logiforce_${key}`, status, enabledModules: [], roleTemplateKeys: ['tenant_admin'] });
    platform.Tenant.docs.push(t('live', 'active'), t('setup', 'provisioning'), t('paused', 'suspended'), t('closed', 'archived'));

    const status = async (key) => (await call('GET', '/api/drivers', { headers: { 'x-tenant-id': key } }));
    assert.equal((await status('setup')).status, 503);
    assert.equal((await status('setup')).body.code, 'TENANT_PROVISIONING');
    assert.equal((await status('paused')).status, 403);
    assert.equal((await status('paused')).body.code, 'TENANT_SUSPENDED');
    assert.equal((await status('closed')).status, 403);
    assert.equal((await status('closed')).body.code, 'TENANT_ARCHIVED');
    assert.deepEqual(opened, [], 'a company that is not active never has its database opened');

    const seen = [];
    const summary = await tenantJobs.forEachActiveTenant('test job', async (tenant) => { seen.push(tenant.key); });
    assert.deepEqual(seen, ['live']);
    assert.deepEqual(summary.done, ['live']);

    // Suspending through the API takes effect at once on this server.
    const suspend = await call('POST', '/api/platform/tenants/live/suspend', { token: signPlatformToken(owner) });
    assert.equal(suspend.status, 200);
    assert.equal((await status('live')).status, 403);
    seen.length = 0;
    await tenantJobs.forEachActiveTenant('test job', async (tenant) => { seen.push(tenant.key); });
    assert.deepEqual(seen, []);
  });
});

describe('tokens never cross between the platform and companies', () => {
  beforeEach(() => {
    const t = (key) => ({ _id: new mongoose.Types.ObjectId(), key, name: key, dbName: `logiforce_${key}`, status: 'active', enabledModules: [], roleTemplateKeys: ['tenant_admin'] });
    platform.Tenant.docs.push(t('alpha'), t('bravo'));
  });

  test('a platform token is refused on company routes', async () => {
    const res = await call('GET', '/api/drivers', { token: signPlatformToken(owner), headers: { 'x-tenant-id': 'alpha' } });
    assert.equal(res.status, 401);
    // Even signed with the company secret, an aud 'platform' token is refused.
    const forged = jwt.sign({ id: String(owner._id), tid: 'alpha', aud: 'platform' }, process.env.JWT_SECRET);
    assert.equal((await call('GET', '/api/drivers', { token: forged, headers: { 'x-tenant-id': 'alpha' } })).status, 401);
  });

  test('a company token is refused on /api/platform', async () => {
    const companyToken = generateToken(new mongoose.Types.ObjectId(), 'alpha');
    const res = await call('GET', '/api/platform/tenants', { token: companyToken });
    assert.equal(res.status, 401);
    assert.equal(res.body.code, 'PLATFORM_AUTH_REQUIRED');
  });

  test('a token for company A sent with x-tenant-id B → 401', async () => {
    const tokenA = generateToken(new mongoose.Types.ObjectId(), 'alpha');
    const res = await call('GET', '/api/drivers', { token: tokenA, headers: { 'x-tenant-id': 'bravo' } });
    assert.equal(res.status, 401);
    assert.equal(res.body.message, 'Token is not valid for this company');
  });
});

describe('no hardcoded companies', () => {
  // Built from pieces so this file doesn't match itself.
  const FORBIDDEN = [
    new RegExp(`\\b${'client'}[abc]\\b`, 'i'),
    new RegExp(['logi', 'force'].join('-')),
    new RegExp(`MONGODB_URI_${'CLIENT'}`),
    new RegExp(`logiforce_${'client'}`),
  ];
  const ROOTS = [path.join(__dirname, '..'), path.join(__dirname, '..', '..', 'client')];
  const SKIP_DIRS = new Set(['node_modules', 'dist', 'logs', 'uploads', '.git']);
  const EXT = /\.(js|jsx|cjs|mjs|json|ya?ml|html|example)$|^Dockerfile$|^\.env\.example$/;

  const walk = (dir, out = []) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(path.join(dir, entry.name), out);
      } else if (EXT.test(entry.name) && !entry.name.startsWith('package-lock')) {
        out.push(path.join(dir, entry.name));
      }
    }
    return out;
  };

  test('no clienta / clientb / clientc (or the old main tenant) in server/ or client/', () => {
    const hits = [];
    for (const file of ROOTS.flatMap((root) => walk(root))) {
      if (file === __filename) continue;
      const lines = fs.readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, i) => {
        if (FORBIDDEN.some((re) => re.test(line))) hits.push(`${path.relative(path.join(__dirname, '..', '..'), file)}:${i + 1}: ${line.trim().slice(0, 120)}`);
      });
    }
    assert.deepEqual(hits, []);
  });
});
