/**
 * Tenant-bound JWTs (Step 4).  npm test
 *
 * Runs the real resolveTenant, auth routes and protect() in an Express app.
 * Only the storage is faked, so no MongoDB is needed: the platform lookup
 * returns two active companies, 'alpha' and 'bravo', and each company gets its
 * own in-memory user store. Both stores hold a user with the SAME _id, so a
 * token that crosses companies is stopped by the `tid` check, not by a failed
 * user lookup.
 */
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-for-tenant-binding';
process.env.MONGODB_BASE_URI = 'mongodb://tenant-db.invalid'; // only to build each company's URI; never opened

require('express-async-errors');
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

// ── Fake platform DB: must be in place before config/tenants.js loads ──

const tenantRecords = {
  alpha: { _id: new mongoose.Types.ObjectId(), key: 'alpha', name: 'Alpha LLC', dbName: 'logiforce_alpha', status: 'active' },
  bravo: { _id: new mongoose.Types.ObjectId(), key: 'bravo', name: 'Bravo LLC', dbName: 'logiforce_bravo', status: 'active' },
};
const platformModels = require('../src/platform/models');
platformModels.getPlatformModels = () => ({
  Tenant: {
    db: { readyState: 1 },
    findOne: ({ key }) => ({ lean: async () => tenantRecords[key] || null }),
  },
});

// ── Fake tenant databases ──

const query = (resolve) => {
  const q = {
    select: () => q,
    populate: () => q,
    lean: () => q,
    then: (onFulfilled, onRejected) => Promise.resolve().then(resolve).then(onFulfilled, onRejected),
  };
  return q;
};

const adminRole = { _id: new mongoose.Types.ObjectId(), name: 'admin', displayName: 'Admin', isSystemRole: true, permissions: [] };

const makeUser = (fields) => {
  const user = {
    _id: new mongoose.Types.ObjectId(),
    isActive: true,
    permissionOverrides: [],
    ...fields,
    async comparePassword(candidate) { return candidate === this.password; },
    async save() { return this; },
    async populate() { return this; },
    async getPermissions() { return []; },
  };
  user.id = String(user._id);
  return user;
};

const makeUserModel = (users) => ({
  findOne: (filter) => query(() => users.find((u) => Object.entries(filter).every(([k, v]) => u[k] === v)) || null),
  findById: (id) => query(() => users.find((u) => String(u._id) === String(id)) || null),
  create: async (data) => {
    const user = makeUser(data);
    users.push(user);
    return user;
  },
});

const SHARED_USER_ID = new mongoose.Types.ObjectId();
const PASSWORD = 'correct-horse-battery';
const users = {
  alpha: [makeUser({ _id: SHARED_USER_ID, name: 'Alpha Admin', email: 'admin@alpha.test', password: PASSWORD, roleId: adminRole })],
  bravo: [makeUser({ _id: SHARED_USER_ID, name: 'Bravo Admin', email: 'admin@bravo.test', password: PASSWORD, roleId: adminRole })],
};
const connections = Object.fromEntries(Object.keys(tenantRecords).map((key) => [key, {
  models: { User: makeUserModel(users[key]), AuditLog: { create: async () => ({}) } },
}]));

const connectionManager = require('../src/config/connectionManager');
connectionManager.getConnectionForTenant = async (tenantConfig) => connections[tenantConfig.key];

// ── App under test: the real middleware and routes ──

const { resolveTenant } = require('../src/middleware/tenant');
const { protect } = require('../src/middleware/auth');
const { generateToken } = require('../src/modules/shared/auth.service');
const { hashEmailOtp } = require('../src/modules/shared/passwordReset.helpers');
const errorHandler = require('../src/middleware/errorHandler');
const logger = require('../src/utils/logger');

const app = express();
app.use(express.json());
app.use('/api', resolveTenant);
app.use('/api/auth', require('../src/modules/shared/auth.routes'));
app.use(errorHandler);

let server;
let baseUrl;

const api = async (method, route, { tenant, token, body } = {}) => {
  const headers = { 'content-type': 'application/json' };
  if (tenant) headers['x-tenant-id'] = tenant;
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${baseUrl}${route}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json().catch(() => null) };
};

const login = async (tenant, email) => {
  const res = await api('POST', '/api/auth/login', { tenant, body: { email, password: PASSWORD } });
  assert.equal(res.status, 200, `login on ${tenant}: ${JSON.stringify(res.body)}`);
  return res.body.data.token;
};

const me = (tenant, token) => api('GET', '/api/auth/me', { tenant, token });

const WRONG_COMPANY = { success: false, message: 'Token is not valid for this company' };
const INVALID = { success: false, message: 'Token is not valid' };
const secret = () => process.env.JWT_SECRET;

before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => { server.once('listening', resolve); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => { server.close(resolve); });
});

describe('tenant-bound JWTs', () => {
  let alphaToken;
  let bravoToken;

  before(async () => {
    alphaToken = await login('alpha', 'admin@alpha.test');
    bravoToken = await login('bravo', 'admin@bravo.test');
  });

  test('login puts the company and audience in the token', () => {
    const claims = jwt.verify(alphaToken, secret());
    assert.equal(claims.id, String(SHARED_USER_ID));
    assert.equal(claims.tid, 'alpha');
    assert.equal(claims.aud, 'tenant');
    assert.ok(claims.exp > claims.iat, 'token has an expiry');
  });

  test('login on tenant A → token works on tenant A', async () => {
    const res = await me('alpha', alphaToken);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.user.email, 'admin@alpha.test');
  });

  test('the same token on tenant B → 401 "Token is not valid for this company"', async () => {
    // Bravo has a user with the same _id, so only the tid check can stop this.
    assert.deepEqual(await me('bravo', alphaToken), { status: 401, body: WRONG_COMPANY });
    assert.deepEqual(await me('alpha', bravoToken), { status: 401, body: WRONG_COMPANY });
    assert.equal((await me('bravo', bravoToken)).status, 200);
  });

  test('an old-style token (no aud, no tid) → 401', async () => {
    const old = jwt.sign({ id: SHARED_USER_ID }, secret(), { expiresIn: '7d' });
    assert.deepEqual(await me('alpha', old), { status: 401, body: INVALID });
  });

  test('a token with the right tid but no aud → 401', async () => {
    const noAud = jwt.sign({ id: SHARED_USER_ID, tid: 'alpha' }, secret(), { expiresIn: '1h' });
    assert.deepEqual(await me('alpha', noAud), { status: 401, body: INVALID });
  });

  test('a token with the right tid but another audience → 401', async () => {
    const platformAud = jwt.sign({ id: SHARED_USER_ID, tid: 'alpha', aud: 'platform' }, secret(), { expiresIn: '1h' });
    assert.deepEqual(await me('alpha', platformAud), { status: 401, body: INVALID });
  });

  test('a token with aud "tenant" but no tid → 401 "Token is not valid for this company"', async () => {
    const noTid = jwt.sign({ id: SHARED_USER_ID, aud: 'tenant' }, secret(), { expiresIn: '1h' });
    assert.deepEqual(await me('alpha', noTid), { status: 401, body: WRONG_COMPANY });
  });

  test('missing and expired tokens keep their existing responses', async () => {
    assert.deepEqual(await me('alpha'), { status: 401, body: { success: false, message: 'No token, authorization denied' } });
    const now = Math.floor(Date.now() / 1000);
    const expired = jwt.sign({ id: SHARED_USER_ID, tid: 'alpha', aud: 'tenant', iat: now - 100, exp: now - 10 }, secret());
    assert.deepEqual(await me('alpha', expired), { status: 401, body: INVALID });
  });

  test('tid is the canonical company key, not the raw x-tenant-id header', async () => {
    const token = await login('  ALPHA ', 'admin@alpha.test');
    assert.equal(jwt.decode(token).tid, 'alpha');
    assert.equal((await me('alpha', token)).status, 200);
    assert.equal((await me('Alpha', token)).status, 200);
    assert.deepEqual(await me('bravo', token), { status: 401, body: WRONG_COMPANY });
  });

  test('OTP login (POST /api/auth/verify-otp) issues a token bound to the company', async () => {
    const user = users.alpha[0];
    Object.assign(user, {
      emailVerifiedAt: new Date(),
      emailOtpHash: hashEmailOtp('123456'),
      emailOtpPurpose: 'login',
      emailOtpExpires: new Date(Date.now() + 60000),
      emailOtpAttempts: 0,
    });
    const res = await api('POST', '/api/auth/verify-otp', {
      tenant: 'alpha',
      body: { email: user.email, code: '123456', purpose: 'login' },
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const { token } = res.body.data;
    assert.equal(jwt.decode(token).tid, 'alpha');
    assert.equal((await me('alpha', token)).status, 200);
    assert.deepEqual(await me('bravo', token), { status: 401, body: WRONG_COMPANY });
  });

  test('register issues a token bound to the company', async () => {
    const res = await api('POST', '/api/auth/register', {
      tenant: 'alpha',
      body: { name: 'New Person', email: 'new@alpha.test', password: 'password123', roleId: String(adminRole._id) },
    });
    assert.equal(res.body?.success, true, JSON.stringify(res.body));
    const { token } = res.body.data;
    assert.equal(jwt.decode(token).tid, 'alpha');
    assert.equal((await me('alpha', token)).status, 200);
    assert.deepEqual(await me('bravo', token), { status: 401, body: WRONG_COMPANY });
  });

  test('register in production (protect called inline) rejects an admin token from another company', async () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const body = { name: 'Prod Person', email: 'prod@alpha.test', password: 'password123', roleId: String(adminRole._id) };
      assert.deepEqual(await api('POST', '/api/auth/register', { tenant: 'alpha', token: bravoToken, body }),
        { status: 401, body: WRONG_COMPANY });
      assert.equal(users.alpha.some((u) => u.email === 'prod@alpha.test'), false, 'user was created');

      const ok = await api('POST', '/api/auth/register', { tenant: 'alpha', token: alphaToken, body });
      assert.equal(ok.body?.success, true, JSON.stringify(ok.body));
      assert.equal(jwt.decode(ok.body.data.token).tid, 'alpha');
    } finally {
      process.env.NODE_ENV = previous;
    }
  });
});

describe('protect() without a resolved tenant', () => {
  const run = async (req) => {
    const res = {
      statusCode: null,
      body: null,
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; return this; },
    };
    let nextCalled = false;
    const logged = [];
    const realError = logger.error;
    logger.error = (message) => { logged.push(message); };
    try {
      await protect(req, res, () => { nextCalled = true; });
    } finally {
      logger.error = realError;
    }
    return { status: res.statusCode, body: res.body, nextCalled, logged };
  };
  const reqWith = (token) => ({
    method: 'GET',
    originalUrl: '/api/somewhere',
    header: (name) => (name.toLowerCase() === 'authorization' ? `Bearer ${token}` : undefined),
    // no tenantKey and no dbConnection: protect must not reach the user lookup
  });

  test('fails closed (401) for a valid token and logs the wiring error', async () => {
    const r = await run(reqWith(generateToken(SHARED_USER_ID, 'alpha')));
    assert.deepEqual({ status: r.status, body: r.body, nextCalled: r.nextCalled }, { status: 401, body: WRONG_COMPANY, nextCalled: false });
    assert.equal(r.logged.length, 1);
  });

  test('fails closed for a token without tid (undefined must never equal undefined)', async () => {
    const noTid = jwt.sign({ id: SHARED_USER_ID, aud: 'tenant' }, secret(), { expiresIn: '1h' });
    const r = await run(reqWith(noTid));
    assert.deepEqual({ status: r.status, body: r.body, nextCalled: r.nextCalled }, { status: 401, body: WRONG_COMPANY, nextCalled: false });
  });
});

describe('generateToken call sites', () => {
  test('generateToken refuses to sign without a tenantKey', () => {
    for (const missing of [undefined, null, '']) {
      assert.throws(() => generateToken(SHARED_USER_ID, missing), /tenantKey is required/);
    }
  });

  test('every call in src passes a tenantKey, and every calling file compiles', () => {
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

    // Top-level arguments of the call whose '(' is at `open`.
    const callArgs = (source, open) => {
      const args = [];
      let depth = 0;
      let current = '';
      for (let i = open; i < source.length; i += 1) {
        const ch = source[i];
        if ('([{'.includes(ch)) depth += 1;
        if (')]}'.includes(ch)) depth -= 1;
        if (depth === 0) break;
        if (ch === ',' && depth === 1) {
          args.push(current.trim());
          current = '';
        } else if (i > open) {
          current += ch;
        }
      }
      args.push(current.trim());
      return args.filter(Boolean);
    };

    const sites = [];
    for (const file of files) {
      const source = fs.readFileSync(file, 'utf8');
      for (const match of source.matchAll(/\bgenerateToken\(/g)) {
        const before = source.slice(Math.max(0, match.index - 6), match.index);
        if (before.endsWith('const ')) continue; // the definition
        const open = match.index + match[0].length - 1;
        const line = source.slice(0, match.index).split('\n').length;
        sites.push({ file: path.relative(srcDir, file), line, args: callArgs(source, open) });
      }
    }

    assert.ok(sites.length >= 4, `expected at least 4 call sites, found ${sites.length}`);
    for (const site of sites) {
      assert.equal(site.args.length, 2, `${site.file}:${site.line} passes ${site.args.length} argument(s): ${site.args.join(', ')}`);
    }
    for (const file of new Set(sites.map((s) => s.file))) {
      const check = spawnSync(process.execPath, ['--check', path.join(srcDir, file)], { encoding: 'utf8' });
      assert.equal(check.status, 0, `${file} does not compile:\n${check.stderr}`);
    }
  });
});
