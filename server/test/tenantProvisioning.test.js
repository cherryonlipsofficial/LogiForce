/**
 * POST /api/platform/tenants and resend-invite (Step 10).  npm test
 *
 * No MongoDB: the platform models and the new company's database are
 * in-memory fakes (test/helpers/fakeDb.js). The real provisioning service,
 * role sync, key rules, reset-URL builder and platform router are used. Email
 * is stubbed. The same flow still needs one run against a real test database.
 */
process.env.NODE_ENV = 'test';
process.env.APP_DOMAIN = 'logiforce.test';
process.env.MONGODB_BASE_URI = 'mongodb://tenant-db.invalid'; // only to build URIs; never opened
process.env.JWT_SECRET = 'tenant-secret-for-tests-only-000000000000';
process.env.PLATFORM_JWT_SECRET = 'platform-secret-for-tests-only-11111111111';
process.env.EMAIL_DEV_LOG = 'false';

require('express-async-errors');
const { test, describe, beforeEach, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { makeModel, clone, idEq } = require('./helpers/fakeDb');
const { systemRoleDocs, platformUserDoc } = require('./helpers/platformRoles');

// Stub the platform models BEFORE anything that destructures getPlatformModels at require time.
const platformModels = require('../src/platform/models');
const platform = {};
platformModels.getPlatformModels = () => platform;

const connectionManager = require('../src/config/connectionManager');
const emailUtils = require('../src/utils/email');
const { schemas } = require('../src/config/modelRegistry');
const { ROLE_TEMPLATES } = require('../src/config/defaultRoles');
const { RESERVED_TENANT_KEYS } = require('../src/platform/models/Tenant');
const { buildResetPasswordUrl, hashResetToken } = require('../src/modules/shared/passwordReset.helpers');
const provisioning = require('../src/platform/services/tenantProvisioning.service');
const { signPlatformToken } = require('../src/platform/services/platformAuth.service');

const {
  validateProvisionInput, provisionTenant, resendAdminInvite, resetAdminPassword, inviteTenantAdmin, TenantProvisioningError,
} = provisioning;

const ACTOR = { userId: new mongoose.Types.ObjectId(), email: 'owner@platform.test' };
const BODY = Object.freeze({
  key: 'acme-co',
  name: 'Acme Co',
  adminName: 'Ada Admin',
  adminEmail: 'Ada@Acme.Test ',
  enabledModules: ['Drivers'],
  roleTemplateKeys: ['viewer'],
});

// ── Fakes ──

const resetPlatform = () => {
  platform.Tenant = makeModel([], {
    unique: ['key', 'dbName'],
    onCreate: (doc) => {
      doc.dbName = doc.dbName || `logiforce_${doc.key.replace(/-/g, '_')}`;
      doc.status = doc.status || 'provisioning';
      doc.provisioningError = doc.provisioningError ?? null;
    },
  });
  platform.RoleTemplate = makeModel(ROLE_TEMPLATES.map((t) => ({ ...clone({ ...t, permissions: [...t.permissions] }), version: 1 })));
  platform.PlatformUser = makeModel([]);
  platform.PlatformRole = makeModel(systemRoleDocs());
  // Like the real record(): keeps only ip / user-agent from req.
  platform.PlatformAuditLog = {
    entries: [],
    record: async ({ req, ...e }) => {
      platform.PlatformAuditLog.entries.push({ ...clone(e), ...(req ? { ip: req.ip, userAgent: req.get?.('user-agent') } : {}) });
    },
  };
};
const actions = () => platform.PlatformAuditLog.entries.map((e) => e.action);

const companyDbs = new Map(); // dbName → fake company database
const makeCompanyDb = ({ collectionsWithData = [] } = {}) => {
  const db = {
    Role: makeModel([], { unique: ['name'] }),
    User: makeModel([], { unique: ['email'] }),
    CompanySettings: makeModel([]),
    indexCalls: 0,
  };
  for (const m of [db.Role, db.User, db.CompanySettings]) {
    m.init = async () => {};
    m.syncIndexes = async () => { db.indexCalls += 1; return []; };
  }
  const models = {};
  for (const name of Object.keys(schemas)) {
    models[name] = db[name] || { init: async () => {}, syncIndexes: async () => { db.indexCalls += 1; return []; } };
  }
  const counts = Object.fromEntries(collectionsWithData.map((n) => [n, 5]));
  db.conn = {
    models,
    db: {
      listCollections: () => ({ toArray: async () => [...Object.keys(counts), 'users'].map((name) => ({ name })) }),
      collection: (name) => ({ estimatedDocumentCount: async () => counts[name] || 0 }),
    },
    close: async () => {},
  };
  return db;
};
connectionManager.getConnectionForTenant = async (tenantConfig) => {
  if (!companyDbs.has(tenantConfig.dbName)) companyDbs.set(tenantConfig.dbName, makeCompanyDb());
  return companyDbs.get(tenantConfig.dbName).conn;
};

const mail = { sent: [], failNext: false, configured: true };
emailUtils.isEmailConfigured = () => mail.configured;
emailUtils.sendPasswordResetEmail = async (message) => {
  if (mail.failNext) {
    mail.failNext = false;
    throw new Error('Resend rejected the email');
  }
  mail.sent.push(message);
  return { id: 'test' };
};

const tokenFrom = (resetUrl) => resetUrl.split('/reset-password/')[1];
const tenantNamed = (key) => platform.Tenant.docs.find((t) => t.key === key);

beforeEach(() => {
  resetPlatform();
  companyDbs.clear();
  mail.sent = [];
  mail.failNext = false;
  mail.configured = true;
});

// ── Tests ──

describe('validateProvisionInput', () => {
  test('normalises and always adds tenant_admin', () => {
    const input = validateProvisionInput({ ...BODY, key: ' Acme-Co ', enabledModules: ['Drivers', 'Drivers'] });
    assert.equal(input.key, 'acme-co');
    assert.equal(input.adminEmail, 'ada@acme.test');
    assert.deepEqual(input.enabledModules, ['Drivers']);
    assert.deepEqual(input.roleTemplateKeys, ['tenant_admin', 'viewer']);
  });

  test('key rule: a lowercase letter, then 2–30 lowercase letters, digits or hyphens', () => {
    for (const key of ['abc', 'first-freight', 'a-b', 'a1-', 'a'.repeat(31)]) assert.equal(validateProvisionInput({ ...BODY, key }).key, key);
    for (const key of ['ab', '-abc', '1st', 'a_b', 'a.b', 'a'.repeat(32), '', 'ab c']) {
      assert.throws(() => validateProvisionInput({ ...BODY, key }), (err) => err.status === 400 && 'key' in err.extra.errors, key);
    }
  });

  test('reserved keys (one exported list) are refused, including www, api, admin, app', () => {
    for (const key of ['www', 'api', 'admin', 'app']) assert.ok(RESERVED_TENANT_KEYS.includes(key));
    for (const key of RESERVED_TENANT_KEYS) {
      assert.throws(() => validateProvisionInput({ ...BODY, key }), /reserved/);
    }
  });

  test('reports every problem at once', () => {
    assert.throws(
      () => validateProvisionInput({ key: 'x', name: '', adminName: ' ', adminEmail: 'nope', enabledModules: ['Nope'], roleTemplateKeys: ['admin'] }),
      (err) => {
        assert.deepEqual(Object.keys(err.extra.errors).sort(), ['adminEmail', 'adminName', 'enabledModules', 'key', 'name', 'roleTemplateKeys']);
        assert.match(err.extra.errors.roleTemplateKeys, /Retired/);
        return true;
      },
    );
  });
});

describe('buildResetPasswordUrl', () => {
  const token = 'a'.repeat(64);
  test('without baseUrl: unchanged (Origin, then Referer, then CLIENT_URL)', () => {
    const saved = process.env.CLIENT_URL;
    process.env.CLIENT_URL = 'https://one.example, https://two.example';
    try {
      assert.equal(buildResetPasswordUrl({ headers: { origin: 'https://x.logiforce.test' } }, token), `https://x.logiforce.test/reset-password/${token}`);
      assert.equal(buildResetPasswordUrl({ headers: { referer: 'https://y.logiforce.test/login?a=1' } }, token), `https://y.logiforce.test/reset-password/${token}`);
      assert.equal(buildResetPasswordUrl({ headers: {} }, token), `https://one.example/reset-password/${token}`);
    } finally {
      if (saved === undefined) delete process.env.CLIENT_URL; else process.env.CLIENT_URL = saved;
    }
  });
  test('baseUrl wins over the request', () => {
    assert.equal(
      buildResetPasswordUrl({ headers: { origin: 'https://platform.logiforce.test' } }, token, 'https://acme.logiforce.test/'),
      `https://acme.logiforce.test/reset-password/${token}`,
    );
    assert.equal(buildResetPasswordUrl(null, token, 'https://acme.logiforce.test'), `https://acme.logiforce.test/reset-password/${token}`);
  });
});

describe('provisionTenant', () => {
  test('happy path: active company, roles, blank settings, admin on tenant_admin, invite to its subdomain, audited', async () => {
    const result = await provisionTenant({ body: BODY, actor: ACTOR });
    assert.equal(result.resumed, false);
    assert.equal(result.tenant.status, 'active');
    assert.equal(result.tenant.url, 'https://acme-co.logiforce.test');

    const tenant = tenantNamed('acme-co');
    assert.equal(tenant.status, 'active');
    assert.equal(tenant.dbName, 'logiforce_acme_co');
    assert.equal(tenant.adminEmail, 'ada@acme.test');
    assert.ok(idEq(tenant.createdBy, ACTOR.userId));
    assert.ok(tenant.provisioning.completedAt && tenant.provisioning.dbCheckedAt);

    const db = companyDbs.get('logiforce_acme_co');
    assert.equal(db.indexCalls, Object.keys(schemas).length, 'syncIndexes not called for every tenant model');
    assert.deepEqual(db.Role.docs.map((r) => r.name).sort(), ['tenant_admin', 'viewer']);
    const adminRole = db.Role.docs.find((r) => r.templateKey === 'tenant_admin');
    assert.equal(adminRole.isSystemRole, false);

    assert.equal(db.CompanySettings.docs.length, 1);
    const settings = db.CompanySettings.docs[0];
    assert.equal(settings.companyName, 'Acme Co');
    for (const f of ['trn', 'bankAccountNo', 'bankIban', 'bankName', 'email', 'addressLine1']) assert.equal(settings[f], '', f);
    assert.equal(settings.invoicePrefix, 'INV');

    assert.equal(db.User.docs.length, 1);
    const user = db.User.docs[0];
    assert.equal(user.email, 'ada@acme.test');
    assert.ok(idEq(user.roleId, adminRole._id));
    assert.equal(user.isActive, true);

    assert.equal(mail.sent.length, 1);
    const [message] = mail.sent;
    assert.equal(message.to, 'ada@acme.test');
    assert.equal(message.tenantName, 'Acme Co');
    assert.match(message.resetUrl, /^https:\/\/acme-co\.logiforce\.test\/reset-password\/[a-f0-9]{64}$/);
    assert.equal(user.passwordResetTokenHash, hashResetToken(tokenFrom(message.resetUrl)));
    assert.ok(user.passwordResetExpires > new Date());

    assert.deepEqual(actions(), ['tenant.create', 'tenant.rolesSynced', 'tenant.provision']);
    assert.ok(platform.PlatformAuditLog.entries.every((e) => e.actor.email === ACTOR.email));
  });

  test('a taken key (active company) is a 409 and nothing changes', async () => {
    await provisionTenant({ body: BODY, actor: ACTOR });
    const writes = platform.Tenant.writes;
    await assert.rejects(provisionTenant({ body: BODY, actor: ACTOR }), (err) => err.status === 409 && err.code === 'TENANT_KEY_TAKEN');
    assert.equal(platform.Tenant.writes, writes);
    assert.equal(mail.sent.length, 1);
  });

  test('invalid input or no email service: nothing is created', async () => {
    await assert.rejects(provisionTenant({ body: { ...BODY, key: 'www' } }), (err) => err.status === 400);
    await assert.rejects(provisionTenant({ body: { ...BODY, roleTemplateKeys: ['no_such'] } }), /Unknown role template/);
    mail.configured = false;
    await assert.rejects(provisionTenant({ body: BODY }), (err) => err.status === 503 && err.code === 'EMAIL_NOT_CONFIGURED');
    assert.equal(platform.Tenant.docs.length, 0);
  });

  test('failure part-way: stays provisioning, error stored and audited; the same call resumes it', async () => {
    // Make the role sync's first write fail once.
    const realGet = connectionManager.getConnectionForTenant;
    connectionManager.getConnectionForTenant = async (cfg) => {
      const conn = await realGet(cfg);
      companyDbs.get(cfg.dbName).Role.failNext ??= { op: 'updateOne', error: new Error('simulated write failure') };
      return conn;
    };
    try {
      await assert.rejects(provisionTenant({ body: BODY, actor: ACTOR }), (err) => {
        assert.ok(err instanceof TenantProvisioningError);
        assert.equal(err.code, 'PROVISIONING_FAILED');
        assert.equal(err.extra.step, 'roles');
        assert.equal(err.extra.retryable, true);
        assert.match(err.message, /failed at step "roles": simulated write failure/);
        return true;
      });
    } finally {
      connectionManager.getConnectionForTenant = realGet;
    }
    let tenant = tenantNamed('acme-co');
    assert.equal(tenant.status, 'provisioning', 'a failed attempt never leaves the company active');
    assert.equal(tenant.provisioningError.step, 'roles');
    assert.match(tenant.provisioningError.message, /simulated write failure/);
    assert.ok(actions().includes('tenant.provisionFailed'));
    assert.equal(mail.sent.length, 0);

    const retry = await provisionTenant({ body: { ...BODY, name: 'Acme Company' }, actor: ACTOR });
    assert.equal(retry.resumed, true);
    tenant = tenantNamed('acme-co');
    assert.equal(tenant.status, 'active');
    assert.equal(tenant.name, 'Acme Company');
    assert.equal(tenant.provisioningError, null);
    assert.equal(platform.Tenant.docs.length, 1);
    const db = companyDbs.get('logiforce_acme_co');
    assert.equal(db.User.docs.length, 1);
    assert.equal(db.CompanySettings.docs.length, 1);
    assert.equal(mail.sent.length, 1);
    assert.ok(actions().includes('tenant.provisionRetry'));
  });

  test('a failed invite email removes the token; the retry sends it and reuses the user', async () => {
    mail.failNext = true;
    await assert.rejects(provisionTenant({ body: BODY, actor: ACTOR }), (err) => err.extra?.step === 'invite');
    const db = companyDbs.get('logiforce_acme_co');
    assert.equal(db.User.docs.length, 1);
    assert.equal(db.User.docs[0].passwordResetTokenHash, null);
    assert.equal(tenantNamed('acme-co').status, 'provisioning');

    await provisionTenant({ body: BODY, actor: ACTOR });
    assert.equal(db.User.docs.length, 1);
    assert.equal(mail.sent.length, 1);
    assert.equal(tenantNamed('acme-co').status, 'active');
  });

  test('a database that already holds data is refused (checkDatabase) and nothing is written to it', async () => {
    companyDbs.set('logiforce_acme_co', makeCompanyDb({ collectionsWithData: ['drivers'] }));
    await assert.rejects(provisionTenant({ body: BODY, actor: ACTOR }), (err) => {
      assert.equal(err.extra.step, 'checkDatabase');
      assert.match(err.message, /already holds data \(drivers\)/);
      return true;
    });
    const db = companyDbs.get('logiforce_acme_co');
    assert.equal(db.Role.docs.length + db.User.docs.length + db.CompanySettings.docs.length, 0);
    assert.equal(tenantNamed('acme-co').status, 'provisioning');
  });

  test('a provisioning attempt started moments ago is not run twice', async () => {
    await platform.Tenant.create({ key: 'acme-co', name: 'Acme', status: 'provisioning', provisioning: { startedAt: new Date() } });
    await assert.rejects(provisionTenant({ body: BODY }), (err) => err.code === 'PROVISIONING_IN_PROGRESS');
  });
});

describe('resendAdminInvite', () => {
  test('sends a fresh link to the recorded admin; the old link stops working', async () => {
    await provisionTenant({ body: BODY, actor: ACTOR });
    const first = tokenFrom(mail.sent[0].resetUrl);
    const result = await resendAdminInvite({ key: 'acme-co', actor: ACTOR });
    assert.equal(result.invite.email, 'ada@acme.test');
    assert.equal(mail.sent.length, 2);
    const second = tokenFrom(mail.sent[1].resetUrl);
    assert.notEqual(first, second);
    assert.match(mail.sent[1].resetUrl, /^https:\/\/acme-co\.logiforce\.test\/reset-password\//);
    const user = companyDbs.get('logiforce_acme_co').User.docs[0];
    assert.equal(user.passwordResetTokenHash, hashResetToken(second));
    assert.equal(actions().at(-1), 'tenant.adminInviteSent');
  });

  test('refused for an unknown or inactive company, and for a user who is not the company admin', async () => {
    await assert.rejects(resendAdminInvite({ key: 'nope-co' }), (err) => err.status === 404);
    await provisionTenant({ body: BODY, actor: ACTOR });
    const db = companyDbs.get('logiforce_acme_co');
    const viewer = db.Role.docs.find((r) => r.name === 'viewer');
    await db.User.create({ email: 'v@acme.test', name: 'V', roleId: viewer._id, isActive: true });
    await assert.rejects(resendAdminInvite({ key: 'acme-co', email: 'v@acme.test' }), (err) => err.code === 'NOT_COMPANY_ADMIN');
    await assert.rejects(resendAdminInvite({ key: 'acme-co', email: 'ghost@acme.test' }), (err) => err.code === 'ADMIN_NOT_FOUND');
    tenantNamed('acme-co').status = 'suspended';
    await assert.rejects(resendAdminInvite({ key: 'acme-co' }), (err) => err.code === 'TENANT_NOT_ACTIVE');
  });
});

describe('company admins after provisioning', () => {
  test('contact and user limit given at provisioning are stored', async () => {
    await provisionTenant({ body: { ...BODY, contact: { name: 'Ana', email: 'ANA@acme.test', phone: '1' }, limits: { maxUsers: 10 } }, actor: ACTOR });
    const t = tenantNamed('acme-co');
    assert.deepEqual(t.contact, { name: 'Ana', email: 'ana@acme.test', phone: '1' });
    assert.equal(t.limits.maxUsers, 10);
    assert.throws(() => validateProvisionInput({ ...BODY, contact: { email: 'x' } }), (err) => 'contact' in err.extra.errors);
    assert.throws(() => validateProvisionInput({ ...BODY, limits: { maxUsers: 0 } }), (err) => 'limits' in err.extra.errors);
  });

  test('invite another admin: created on tenant_admin with a random password and emailed a link', async () => {
    await provisionTenant({ body: BODY, actor: ACTOR });
    const result = await inviteTenantAdmin({ key: 'acme-co', body: { name: 'Bo', email: 'BO@acme.test' }, actor: ACTOR });
    assert.equal(result.invite.sent, true);
    const db = companyDbs.get('logiforce_acme_co');
    const bo = db.User.docs.find((u) => u.email === 'bo@acme.test');
    const adminRole = db.Role.docs.find((r) => r.templateKey === 'tenant_admin');
    assert.equal(String(bo.roleId), String(adminRole._id));
    assert.match(mail.sent.at(-1).resetUrl, /^https:\/\/acme-co\.logiforce\.test\/reset-password\/[a-f0-9]{64}$/);
    assert.equal(actions().at(-1), 'tenant.adminInvited');
    // an existing company user is never taken over
    await assert.rejects(inviteTenantAdmin({ key: 'acme-co', body: { name: 'Bo', email: 'bo@acme.test' }, actor: ACTOR }),
      (err) => err.code === 'USER_EXISTS');
  });

  test('reset password: emails a reset link to a company admin; never returns a password', async () => {
    await provisionTenant({ body: BODY, actor: ACTOR });
    const result = await resetAdminPassword({ key: 'acme-co', email: 'ada@acme.test', actor: ACTOR });
    assert.equal(result.invite.email, 'ada@acme.test');
    assert.ok(!JSON.stringify(result).match(/password"\s*:/i), 'no password in the response');
    assert.equal(actions().at(-1), 'tenant.adminPasswordReset');
    await assert.rejects(resetAdminPassword({ key: 'acme-co', actor: ACTOR }), (err) => err.status === 400);
  });
});

describe('HTTP: platform auth only', () => {
  let server;
  let base;
  const owner = platformUserDoc('platform_owner', { email: 'owner@platform.test', name: 'O' });
  const support = platformUserDoc('platform_support', { email: 'support@platform.test', name: 'S' });

  before(async () => {
    const express = require('express');
    const app = express();
    app.use(express.json());
    app.use('/api/platform', require('../src/platform/platform.routes'));
    await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
    base = `http://127.0.0.1:${server.address().port}/api/platform`;
  });
  after(() => new Promise((resolve) => server.close(resolve)));
  beforeEach(() => { platform.PlatformUser.docs.push(clone(owner), clone(support)); });

  const post = (path, body, token) => fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });

  test('no token → 401; tenant JWT → 401; support → 403; owner → 201', async () => {
    assert.equal((await post('/tenants', BODY)).status, 401);
    const tenantJwt = require('jsonwebtoken').sign({ id: 'x', tid: 'acme-co' }, process.env.JWT_SECRET, { audience: 'tenant' });
    assert.equal((await post('/tenants', BODY, tenantJwt)).status, 401);
    assert.equal((await post('/tenants', BODY, signPlatformToken(support))).status, 403);

    const res = await post('/tenants', BODY, signPlatformToken(owner));
    const json = await res.json();
    assert.equal(res.status, 201);
    assert.equal(json.success, true);
    assert.equal(json.tenant.status, 'active');
    assert.equal(platform.PlatformAuditLog.entries.find((e) => e.action === 'tenant.provision').actor.email, owner.email);
  });

  test('errors come back as { success: false, message, code }', async () => {
    const bad = await post('/tenants', { ...BODY, key: 'api' }, signPlatformToken(owner));
    assert.equal(bad.status, 400);
    const json = await bad.json();
    assert.equal(json.success, false);
    assert.equal(json.code, 'VALIDATION_ERROR');
    assert.match(json.errors.key, /reserved/);
  });

  test('Support may resend an invite and reset an admin password, but not invite a new admin', async () => {
    await post('/tenants', BODY, signPlatformToken(owner));
    const asSupport = signPlatformToken(support);
    assert.equal((await post('/tenants/acme-co/resend-invite', {}, asSupport)).status, 200);
    assert.equal((await post('/tenants/acme-co/admins/reset-password', { email: 'ada@acme.test' }, asSupport)).status, 200);
    assert.equal((await post('/tenants/acme-co/admins', { name: 'X', email: 'x@acme.test' }, asSupport)).status, 403);
    assert.equal((await post('/tenants/acme-co/admins', { name: 'X', email: 'x@acme.test' }, signPlatformToken(owner))).status, 201);
  });

  test('POST /tenants/:key/resend-invite', async () => {
    await post('/tenants', BODY, signPlatformToken(owner));
    const res = await post('/tenants/acme-co/resend-invite', {}, signPlatformToken(owner));
    assert.equal(res.status, 200);
    assert.equal((await res.json()).invite.email, 'ada@acme.test');
    assert.equal(mail.sent.length, 2);
  });
});
