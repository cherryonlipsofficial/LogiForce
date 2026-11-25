/**
 * Verify platform (product-owner) login.  npm run platform:verify-auth
 *
 * Uses the same env as the server (PLATFORM_MONGODB_URI, PLATFORM_JWT_SECRET,
 * JWT_SECRET, tenant MONGODB_URI_* ...). It starts the real server (node
 * server.js) as a child process on a free port, with NODE_ENV=development and
 * EMAIL_DEV_LOG=true: that is the mailer stub. Nothing is sent; the child
 * prints each email to its console and this script reads the codes from there.
 *
 * What it writes:
 *   - throwaway platform users verify-auth-<random>-*@example.invalid (deleted
 *     again at the end, with their login challenges);
 *   - the audit entries their logins produce (platform_audit_logs is
 *     append-only, so those stay);
 *   - one run of `npm run platform:seed` twice (idempotent).
 * It never writes to a tenant database, except the OTP fields and lastLogin
 * of the company user in item 12, which signs in exactly like a person would.
 *
 * Item 12 (company user OTP login) needs an active, email-verified company user:
 *   VERIFY_TENANT=logi-force VERIFY_COMPANY_EMAIL=admin@logiforce.com npm run platform:verify-auth
 *
 * Prints PASS/FAIL per check; exits 1 if anything fails.
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });

const path = require('path');
const net = require('net');
const crypto = require('crypto');
const { spawn } = require('child_process');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { connectPlatformDb, closePlatformDb, getPlatformConnection, getPlatformDbName } = require('../db');
const { getPlatformModels, PLATFORM_MODELS } = require('../models');
const { platformAuthEnvProblem, getPlatformJwtSecret } = require('../config');
const { sha256, hmacCode } = require('../services/platformAuth.service');
const { PLATFORM_LOGIN_SUBJECT } = require('../services/platformMailer');
const { resolveLegacyTenant } = require('./seedPlatform');

const SERVER_DIR = path.resolve(__dirname, '../../..');
const RUN = crypto.randomBytes(3).toString('hex');
const TENANT_ERROR = /Tenant could not be determined|Unknown tenant|Tenant resolution failed/;

// ── Harness ──

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

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

const show = (res) => `${res.status} ${res.text.slice(0, 200)}`;

// Each check uses its own client IP (sent as X-Forwarded-For, which the server
// trusts for one hop), so the per-IP rate limits of one check don't affect another.
let ipCounter = 10;
const nextIp = () => `203.0.113.${ipCounter++}`;

// ── Child processes ──

const freePort = () => new Promise((resolve, reject) => {
  const srv = net.createServer();
  srv.unref();
  srv.on('error', reject);
  srv.listen(0, '127.0.0.1', () => {
    const { port } = srv.address();
    srv.close(() => resolve(port));
  });
});

const stripAnsi = (s) => s.replace(/\u001b\[[0-9;]*m/g, '');

/** Spawn a process and collect its output lines (stdout + stderr). */
const run = (command, args, { env = {}, cwd = SERVER_DIR } = {}) => {
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'], // stdin is not a TTY
  });
  const proc = { child, lines: [] };
  for (const stream of [child.stdout, child.stderr]) {
    let rest = '';
    stream.on('data', (buf) => {
      const parts = (rest + buf.toString()).split('\n');
      rest = parts.pop();
      for (const line of parts) proc.lines.push(stripAnsi(line));
    });
    stream.on('end', () => { if (rest) proc.lines.push(stripAnsi(rest)); });
  }
  proc.exited = new Promise((resolve) => {
    child.on('exit', (code) => setImmediate(() => resolve(code)));
  });
  proc.output = () => proc.lines.join('\n');
  return proc;
};

const withTimeout = (promise, ms, label) => Promise.race([
  promise,
  sleep(ms).then(() => { throw new Error(`${label}: timed out after ${ms / 1000}s`); }),
]);

const waitForLine = async (proc, pattern, { since = 0, timeoutMs = 30000 } = {}) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const index = proc.lines.findIndex((line, i) => i >= since && pattern.test(line));
    if (index !== -1) return proc.lines[index];
    if (proc.child.exitCode !== null) throw new Error(`process exited (${proc.child.exitCode}) before printing ${pattern}`);
    await sleep(50);
  }
  throw new Error(`timed out waiting for ${pattern}`);
};

const startServer = async (env = {}) => {
  const port = await freePort();
  const proc = run(process.execPath, ['server.js'], {
    env: { NODE_ENV: 'development', EMAIL_DEV_LOG: 'true', ...env, PORT: String(port) },
  });
  proc.base = `http://127.0.0.1:${port}`;
  return proc;
};

const stopServer = async (proc) => {
  if (!proc || proc.child.exitCode !== null) return;
  proc.child.kill('SIGTERM');
  await withTimeout(proc.exited, 15000, 'server shutdown').catch(() => proc.child.kill('SIGKILL'));
};

// ── HTTP ──

const api = async (server, method, urlPath, { body, token, tenant, ip, headers = {} } = {}) => {
  const h = { ...headers };
  if (body !== undefined) h['content-type'] = 'application/json';
  if (token) h.authorization = `Bearer ${token}`;
  if (tenant) h['x-tenant-id'] = tenant;
  if (ip) h['x-forwarded-for'] = ip;
  const started = performance.now();
  const res = await fetch(server.base + urlPath, {
    method,
    headers: h,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const ms = performance.now() - started;
  let json = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, body: json, text, ms };
};

// ── The mailer stub: emails the child printed with EMAIL_DEV_LOG=true ──

const mailsIn = (server, since = 0) => server.lines.slice(since)
  .filter((line) => line.includes('EMAIL_DEV_LOG') && line.includes('{"'))
  .map((line) => {
    try { return JSON.parse(line.slice(line.indexOf('{"'))); } catch { return null; }
  })
  .filter(Boolean);

const waitForMail = async (server, { to, subject, since }, timeoutMs = 10000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const mail = mailsIn(server, since).find((m) => m.to === to && subject.test(m.subject || ''));
    if (mail) {
      const match = /code: (\d{6})\b/.exec(mail.text || '');
      assert(match, `email to ${to} has no 6-digit code`);
      return { mail, code: match[1] };
    }
    await sleep(50);
  }
  throw new Error(`no email to ${to} matching ${subject} within ${timeoutMs / 1000}s`);
};

const wrongCode = (code) => String((Number(code) + 1) % 1_000_000).padStart(6, '0');

// ── Fixtures ──

const fixtures = [];

const makeUser = async (label, { status = 'active', role = 'owner' } = {}) => {
  const { PlatformUser } = getPlatformModels();
  const email = `verify-auth-${RUN}-${label}@example.invalid`;
  const password = `Pw-${crypto.randomBytes(12).toString('hex')}`;
  const user = new PlatformUser({ email, name: `Verify ${label}`, role, status });
  await user.setPassword(password);
  await user.save();
  fixtures.push(email);
  return { id: user._id, email, password };
};

/** login → code from the stubbed mailer. */
const loginAndGetCode = async (server, who, ip) => {
  const since = server.lines.length;
  const res = await api(server, 'POST', '/api/platform/auth/login', { body: { email: who.email, password: who.password }, ip });
  assert(res.status === 200 && res.body?.challengeToken, `login returned ${show(res)}`);
  const { mail, code } = await waitForMail(server, { to: who.email, subject: /^LogiForce platform sign-in code$/, since });
  return { res, mail, code, challengeToken: res.body.challengeToken };
};

/** login + verify → platform token. */
const signIn = async (server, who, ip) => {
  const { code, challengeToken } = await loginAndGetCode(server, who, ip);
  const res = await api(server, 'POST', '/api/platform/auth/verify-otp', { body: { challengeToken, code }, ip });
  assert(res.status === 200 && res.body?.token, `verify-otp returned ${show(res)}`);
  return res.body.token;
};

// ── Tenant databases ──

// The companies that used to be hardcoded (config/tenants.js now reads them
// from the platform DB); only used here to find their databases.
const configuredTenants = () => {
  const { tenants: legacyTenants } = require('./legacyTenants');
  return Object.entries(legacyTenants)
    .map(([key, cfg]) => ({ key, cfg, live: resolveLegacyTenant(key, cfg) }))
    .filter((t) => t.live.dbName);
};

const tenantCollections = async () => {
  const out = new Map();
  for (const { key, cfg, live } of configuredTenants()) {
    if (out.has(live.dbName)) continue;
    const conn = await mongoose.createConnection(cfg.dbUri, {
      ...(cfg.dbUri.startsWith('mongodb+srv://') ? { tls: true, tlsAllowInvalidCertificates: false } : {}),
      serverSelectionTimeoutMS: 5000,
    }).asPromise();
    try {
      const names = (await conn.db.listCollections().toArray()).map((c) => c.name);
      out.set(live.dbName, { key, names: new Set(names) });
    } finally {
      await conn.close();
    }
  }
  return out;
};

// ── Checks ──

const main = async () => {
  const envProblem = platformAuthEnvProblem();
  if (envProblem) throw new Error(`this script needs the server's env: ${envProblem}`);
  if (!process.env.JWT_SECRET) throw new Error('this script needs the server\'s env: JWT_SECRET is not set');

  await connectPlatformDb();
  const { PlatformUser, PlatformAuditLog, PlatformLoginChallenge } = getPlatformModels();
  await Promise.all(PLATFORM_MODELS.map(({ name }) => getPlatformModels()[name].init()));
  console.log(`Platform database: ${getPlatformDbName()}   run id: ${RUN}\n`);

  // 1 ─ startup refuses a missing / weak / reused PLATFORM_JWT_SECRET
  await check('1. server refuses to start without PLATFORM_JWT_SECRET, with a short one, or with JWT_SECRET', async () => {
    const cases = [
      { label: 'missing', value: '', expect: /PLATFORM_JWT_SECRET is not set/ },
      { label: 'too short', value: 'x'.repeat(31), expect: /PLATFORM_JWT_SECRET is too short/ },
      { label: 'equal to JWT_SECRET', value: process.env.JWT_SECRET, expect: /must not be the same as JWT_SECRET/ },
    ];
    for (const c of cases) {
      const proc = await startServer({ PLATFORM_JWT_SECRET: c.value });
      const code = await withTimeout(proc.exited, 20000, `start with ${c.label} secret`);
      const output = proc.output();
      assert(code === 1, `${c.label}: exit code ${code}, expected 1`);
      assert(c.expect.test(output), `${c.label}: no clear message in output:\n${output.slice(-400)}`);
      assert(!/Server running on port/.test(output), `${c.label}: server started listening`);
      if (c.value && c.value.length >= 8) assert(!output.includes(c.value), `${c.label}: the secret value was printed`);
    }
  });

  const server = await startServer();
  try {
    await waitForLine(server, /Server running on port/, { timeoutMs: 45000 });
  } catch (err) {
    throw new Error(`the server did not start: ${err.message}\n${server.output().slice(-1500)}`);
  }

  try {
    // Let the startup tenant jobs finish before taking the tenant snapshot (item 13).
    const tenantCount = configuredTenants().length;
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline
      && server.lines.filter((l) => /\[Startup\] Ledger cleanup (done|failed) for/.test(l)).length < tenantCount) {
      await sleep(100);
    }
    const tenantsBefore = await tenantCollections();

    const userA = await makeUser('a');
    const userDisabled = await makeUser('disabled', { status: 'disabled' });
    const userC = await makeUser('c');
    const userR = await makeUser('r', { role: 'support' });

    // 2 + 4 share one login
    let firstLogin = null;
    const ip2 = nextIp();
    await check('2. POST /api/platform/auth/login works with no x-tenant-id and no tenant subdomain', async () => {
      const since = server.lines.length;
      const res = await api(server, 'POST', '/api/platform/auth/login', {
        body: { email: userA.email, password: userA.password }, ip: ip2,
      });
      assert(res.status === 200 && res.body?.success === true, `got ${show(res)}`);
      assert(!TENANT_ERROR.test(res.text), 'response is a tenant error');
      firstLogin = { res, since };
    });

    await check('3. unknown email, wrong password and disabled user get the identical 401 body', async () => {
      const ip = nextIp();
      const unknown = await api(server, 'POST', '/api/platform/auth/login', {
        body: { email: `nobody-${RUN}@example.invalid`, password: 'whatever-password-123' }, ip,
      });
      const wrong = await api(server, 'POST', '/api/platform/auth/login', {
        body: { email: userA.email, password: `${userA.password}x` }, ip,
      });
      const disabled = await api(server, 'POST', '/api/platform/auth/login', {
        body: { email: userDisabled.email, password: userDisabled.password }, ip,
      });
      const expected = JSON.stringify({ success: false, message: 'Invalid email or password', code: 'INVALID_CREDENTIALS' });
      for (const [label, res] of [['unknown email', unknown], ['wrong password', wrong], ['disabled user', disabled]]) {
        assert(res.status === 401, `${label}: status ${res.status}`);
        assert(res.text === expected, `${label}: body ${res.text}`);
      }
      // bcrypt ran for the unknown email too (lenient: within half of the wrong-password time).
      console.log(`      timing: unknown ${unknown.ms.toFixed(0)}ms, wrong password ${wrong.ms.toFixed(0)}ms, `
        + `disabled ${disabled.ms.toFixed(0)}ms`);
      assert(unknown.ms >= wrong.ms * 0.5, 'unknown email answered much faster than a wrong password');
      const challenges = await PlatformLoginChallenge.countDocuments({ userId: userDisabled.id });
      assert(challenges === 0, 'a challenge was created for the disabled user');
    });

    await check('4. correct password → challengeToken and no JWT; the mailer got a 6-digit code', async () => {
      assert(firstLogin, 'login in check 2 failed');
      const { res, since } = firstLogin;
      const keys = Object.keys(res.body).sort().join(',');
      assert(keys === 'challengeToken,expiresAt,maskedEmail,success', `response keys: ${keys}`);
      assert(/^[a-f0-9]{64}$/.test(res.body.challengeToken), 'challengeToken is not 32 random bytes in hex');
      assert(!/eyJ[\w-]+\.[\w-]+\./.test(res.text), 'response contains a JWT');
      const expiresIn = new Date(res.body.expiresAt).getTime() - Date.now();
      assert(expiresIn > 9 * 60 * 1000 && expiresIn <= 10 * 60 * 1000, `expiresAt is ${Math.round(expiresIn / 1000)}s away`);
      assert(res.body.maskedEmail === `v***@example.invalid`, `maskedEmail ${res.body.maskedEmail}`);

      const { mail, code } = await waitForMail(server, { to: userA.email, subject: /./, since });
      assert(mail.subject === PLATFORM_LOGIN_SUBJECT, `subject "${mail.subject}"`);
      assert(/^\d{6}$/.test(code), `code ${code}`);
      assert(mail.text.includes(`Requested from IP address ${ip2}`), 'email does not show the request IP');
      assert(/expires at .+GMT/.test(mail.text), 'email does not show the expiry time');

      const challenge = await PlatformLoginChallenge.findOne({ userId: userA.id }).lean();
      assert(challenge, 'no challenge stored');
      assert(challenge.tokenHash === sha256(res.body.challengeToken), 'tokenHash is not sha256(challengeToken)');
      assert(challenge.codeHash === hmacCode(code), 'codeHash is not HMAC-SHA256(code)');
      const stored = JSON.stringify(challenge);
      assert(!stored.includes(res.body.challengeToken) && !stored.includes(`"${code}"`), 'a plain token or code is stored');
      assert(challenge.ip === ip2 && challenge.userAgent, 'ip / userAgent not stored');
    });

    await check('5. 5 wrong codes lock the challenge, and the correct code fails after that', async () => {
      const ip = nextIp();
      const { code, challengeToken } = await loginAndGetCode(server, userA, ip);
      const bad = wrongCode(code);
      for (let i = 1; i <= 5; i += 1) {
        const res = await api(server, 'POST', '/api/platform/auth/verify-otp', { body: { challengeToken, code: bad }, ip });
        const want = i < 5 ? 'OTP_INVALID' : 'OTP_LOCKED';
        assert(res.status === 401 && res.body?.code === want, `wrong code #${i}: ${show(res)}`);
        if (i === 5) assert(res.body.message === 'Too many attempts, sign in again', `message: ${res.body.message}`);
      }
      const after = await api(server, 'POST', '/api/platform/auth/verify-otp', { body: { challengeToken, code }, ip });
      assert(after.status === 401 && after.body?.code === 'OTP_INVALID' && !after.body.token, `correct code after lock: ${show(after)}`);
      assert(!(await PlatformLoginChallenge.exists({ tokenHash: sha256(challengeToken) })), 'locked challenge was not deleted');
      const audit = await PlatformAuditLog.findOne({ action: 'platformUser.otp_locked', targetId: userA.id }).lean();
      assert(audit && audit.ip === ip, 'no platformUser.otp_locked audit entry with the request IP');
    });

    let tokenA = null;
    await check('6. correct code → JWT; the same code fails a second time; an expired challenge fails', async () => {
      const ip = nextIp();
      const { code, challengeToken } = await loginAndGetCode(server, userA, ip);
      const ok = await api(server, 'POST', '/api/platform/auth/verify-otp', { body: { challengeToken, code }, ip });
      assert(ok.status === 200 && ok.body?.success === true && ok.body.token, `verify: ${show(ok)}`);
      const userKeys = Object.keys(ok.body.user || {}).sort().join(',');
      assert(userKeys === '_id,email,name,role', `user keys: ${userKeys}`);
      tokenA = ok.body.token;

      const { header, payload } = jwt.decode(tokenA, { complete: true });
      assert(header.alg === 'HS256', `alg ${header.alg}`);
      assert(payload.sub === String(userA.id) && payload.role === 'owner' && payload.tv === 0, `payload ${JSON.stringify(payload)}`);
      assert(payload.aud === 'platform' && payload.iss === 'logiforce-platform', `aud/iss ${payload.aud}/${payload.iss}`);
      const configured = (process.env.PLATFORM_JWT_EXPIRES_IN || '').trim();
      if (!configured || configured === '8h') assert(payload.exp - payload.iat === 8 * 3600, `lifetime ${payload.exp - payload.iat}s`);
      jwt.verify(tokenA, getPlatformJwtSecret(), { algorithms: ['HS256'], audience: 'platform', issuer: 'logiforce-platform' });

      const again = await api(server, 'POST', '/api/platform/auth/verify-otp', { body: { challengeToken, code }, ip });
      assert(again.status === 401 && again.body?.code === 'OTP_INVALID' && !again.body.token, `reuse: ${show(again)}`);

      const user = await PlatformUser.findById(userA.id).lean();
      assert(user.lastLoginAt && Date.now() - user.lastLoginAt.getTime() < 60000, 'lastLoginAt not set');
      const audit = await PlatformAuditLog.findOne({ action: 'platformUser.login', targetId: userA.id }).lean();
      assert(audit && audit.ip === ip && audit.userAgent, 'no platformUser.login audit entry with ip and user agent');
      assert(String(audit.actor.userId) === String(userA.id), 'login audit actor is not the user');

      const expired = await loginAndGetCode(server, userA, ip);
      await PlatformLoginChallenge.updateOne(
        { tokenHash: sha256(expired.challengeToken) },
        { $set: { expiresAt: new Date(Date.now() - 1000) } }
      );
      const late = await api(server, 'POST', '/api/platform/auth/verify-otp', {
        body: { challengeToken: expired.challengeToken, code: expired.code }, ip,
      });
      assert(late.status === 401 && late.body?.code === 'OTP_INVALID', `expired: ${show(late)}`);
    });

    await check('6b. resend: 60s apart, new code replaces the old one, at most 3 resends', async () => {
      const ip = nextIp();
      const first = await loginAndGetCode(server, userR, ip);
      const tooSoon = await api(server, 'POST', '/api/platform/auth/resend-otp', { body: { challengeToken: first.challengeToken }, ip });
      assert(tooSoon.status === 429 && tooSoon.body?.code === 'OTP_RESEND_TOO_SOON', `immediate resend: ${show(tooSoon)}`);

      const tokenHash = sha256(first.challengeToken);
      await PlatformLoginChallenge.updateOne(
        { tokenHash },
        { $set: { lastSentAt: new Date(Date.now() - 61000), attempts: 2 } }
      );
      const since = server.lines.length;
      const resent = await api(server, 'POST', '/api/platform/auth/resend-otp', { body: { challengeToken: first.challengeToken }, ip });
      assert(resent.status === 200 && resent.body?.resendsRemaining === 2, `resend: ${show(resent)}`);
      const { code: newCode } = await waitForMail(server, { to: userR.email, subject: /^LogiForce platform sign-in code$/, since });
      const doc = await PlatformLoginChallenge.findOne({ tokenHash }).lean();
      assert(doc.attempts === 0 && doc.resendCount === 1, `attempts ${doc.attempts}, resendCount ${doc.resendCount}`);
      assert(doc.expiresAt.getTime() - Date.now() > 9 * 60 * 1000, 'expiresAt was not reset to 10 minutes');

      if (newCode !== first.code) {
        const old = await api(server, 'POST', '/api/platform/auth/verify-otp', { body: { challengeToken: first.challengeToken, code: first.code }, ip });
        assert(old.status === 401 && old.body?.code === 'OTP_INVALID', `old code after resend: ${show(old)}`);
      }
      const ok = await api(server, 'POST', '/api/platform/auth/verify-otp', { body: { challengeToken: first.challengeToken, code: newCode }, ip });
      assert(ok.status === 200 && ok.body?.token && ok.body.user.role === 'support', `new code: ${show(ok)}`);

      const second = await loginAndGetCode(server, userR, ip);
      await PlatformLoginChallenge.updateOne(
        { tokenHash: sha256(second.challengeToken) },
        { $set: { resendCount: 3, lastSentAt: new Date(Date.now() - 61000) } }
      );
      const limit = await api(server, 'POST', '/api/platform/auth/resend-otp', { body: { challengeToken: second.challengeToken }, ip });
      assert(limit.status === 429 && limit.body?.code === 'OTP_RESEND_LIMIT', `4th resend: ${show(limit)}`);
    });

    await check('7. GET /api/platform/auth/me: 200 with a platform token; 401 with a tenant token or none', async () => {
      assert(tokenA, 'no platform token (check 6 failed)');
      const me = await api(server, 'GET', '/api/platform/auth/me', { token: tokenA });
      assert(me.status === 200 && me.body?.success === true, `platform token: ${show(me)}`);
      assert(me.body.user.email === userA.email && Object.keys(me.body.user).sort().join(',') === '_id,email,name,role',
        `user: ${JSON.stringify(me.body.user)}`);

      const expected = JSON.stringify({ success: false, message: 'Not authorized', code: 'PLATFORM_AUTH_REQUIRED' });
      const { generateToken } = require('../../modules/shared/auth.service');
      const secret = getPlatformJwtSecret();
      const now = Math.floor(Date.now() / 1000);
      const claims = { sub: String(userA.id), role: 'owner', tv: 0 };
      const opts = { algorithm: 'HS256', audience: 'platform', issuer: 'logiforce-platform', expiresIn: '1h' };
      const bad = {
        'tenant token': generateToken(new mongoose.Types.ObjectId()),
        'tenant token for the same id': generateToken(userA.id),
        'platform claims signed with JWT_SECRET': jwt.sign(claims, process.env.JWT_SECRET, opts),
        'wrong audience': jwt.sign(claims, secret, { ...opts, audience: 'tenant' }),
        'wrong issuer': jwt.sign(claims, secret, { ...opts, issuer: 'someone-else' }),
        'alg none': jwt.sign(claims, null, { algorithm: 'none', audience: 'platform', issuer: 'logiforce-platform' }),
        'expired': jwt.sign({ ...claims, exp: now - 10, iat: now - 100 }, secret,
          { algorithm: 'HS256', audience: 'platform', issuer: 'logiforce-platform' }),
        'old tokenVersion': jwt.sign({ ...claims, tv: 1 }, secret, opts),
        'no tokenVersion': jwt.sign({ sub: claims.sub, role: 'owner' }, secret, opts),
        'unknown user': jwt.sign({ ...claims, sub: String(new mongoose.Types.ObjectId()) }, secret, opts),
        'garbage': 'not-a-jwt',
      };
      for (const [label, token] of Object.entries(bad)) {
        const res = await api(server, 'GET', '/api/platform/auth/me', { token });
        assert(res.status === 401 && res.text === expected, `${label}: ${show(res)}`);
      }
      const none = await api(server, 'GET', '/api/platform/auth/me');
      assert(none.status === 401 && none.text === expected, `no token: ${show(none)}`);
    });

    const tenant = process.env.VERIFY_TENANT || configuredTenants()[0]?.key;
    await check(`8. a platform token on a tenant route (GET /api/users, x-tenant-id: ${tenant}) gets 401`, async () => {
      assert(tokenA, 'no platform token (check 6 failed)');
      assert(tenant, 'no tenant with a configured database URI');
      for (const route of ['/api/users', '/api/auth/me']) {
        const res = await api(server, 'GET', route, { token: tokenA, tenant });
        assert(res.status === 401, `${route}: ${show(res)}`);
        assert(!TENANT_ERROR.test(res.text), `${route}: tenant was not resolved: ${res.text}`);
      }
    });

    await check('9a. disabling the user makes their existing token return 401', async () => {
      assert(tokenA, 'no platform token (check 6 failed)');
      await PlatformUser.updateOne({ _id: userA.id }, { $set: { status: 'disabled' } });
      const res = await api(server, 'GET', '/api/platform/auth/me', { token: tokenA });
      assert(res.status === 401 && res.body?.code === 'PLATFORM_AUTH_REQUIRED', `disabled: ${show(res)}`);
      await PlatformUser.updateOne({ _id: userA.id }, { $set: { status: 'active' } });
      const back = await api(server, 'GET', '/api/platform/auth/me', { token: tokenA });
      assert(back.status === 200, `re-enabled: ${show(back)}`);
      console.log('      (re-enabling the user makes the same token work again: only a password reset revokes it)');
    });

    await check('9b. platform:create-owner --reset-password makes existing tokens return 401', async () => {
      const ip = nextIp();
      const tokenC = await signIn(server, userC, ip);
      const pending = await loginAndGetCode(server, userC, ip); // a sign-in waiting for its code
      const me = await api(server, 'GET', '/api/platform/auth/me', { token: tokenC });
      assert(me.status === 200, `before reset: ${show(me)}`);

      const before = await PlatformUser.findById(userC.id).select('+passwordHash').lean();
      const newPassword = `New-${crypto.randomBytes(12).toString('hex')}`;
      const script = run('npm', ['run', 'platform:create-owner', '--', '--email', userC.email, '--reset-password'], {
        env: { PLATFORM_OWNER_PASSWORD: newPassword },
      });
      const code = await withTimeout(script.exited, 60000, 'create-owner --reset-password');
      assert(code === 0, `exit ${code}:\n${script.output().slice(-600)}`);
      assert(!script.output().includes(newPassword), 'the script printed the password');

      const after = await PlatformUser.findById(userC.id).select('+passwordHash').lean();
      assert((after.tokenVersion ?? 0) === (before.tokenVersion ?? 0) + 1, `tokenVersion ${before.tokenVersion} → ${after.tokenVersion}`);
      assert(after.passwordHash !== before.passwordHash, 'password hash did not change');
      assert(after.role === before.role && after.status === before.status, 'role or status changed');

      const res = await api(server, 'GET', '/api/platform/auth/me', { token: tokenC });
      assert(res.status === 401 && res.body?.code === 'PLATFORM_AUTH_REQUIRED', `old token after reset: ${show(res)}`);
      const stale = await api(server, 'POST', '/api/platform/auth/verify-otp', {
        body: { challengeToken: pending.challengeToken, code: pending.code }, ip,
      });
      assert(stale.status === 401, `pending sign-in after reset: ${show(stale)}`);
      const oldPw = await api(server, 'POST', '/api/platform/auth/login', { body: { email: userC.email, password: userC.password }, ip });
      assert(oldPw.status === 401, `old password: ${show(oldPw)}`);
      const newPw = await api(server, 'POST', '/api/platform/auth/login', { body: { email: userC.email, password: newPassword }, ip });
      assert(newPw.status === 200 && newPw.body?.challengeToken, `new password: ${show(newPw)}`);

      const audit = await PlatformAuditLog.findOne({ action: 'platformUser.password_reset', targetId: userC.id }).lean();
      assert(audit && audit.actor.email === 'system' && audit.actor.userId === null, 'no password_reset audit entry by system');
    });

    await check('10. GET /api/platform/nope is answered by the platform router (404 signed in, 401 not), never by the tenant middleware', async () => {
      const signedIn = await api(server, 'GET', '/api/platform/nope', { token: tokenA });
      assert(signedIn.status === 404 && signedIn.body?.code === 'PLATFORM_NOT_FOUND', `with token: ${show(signedIn)}`);
      for (const [method, route] of [['GET', '/api/platform/nope'], ['POST', '/api/platform/auth/nope'], ['GET', '/api/platform']]) {
        const res = await api(server, method, route);
        assert(res.status === 401 && res.body?.code === 'PLATFORM_AUTH_REQUIRED', `${method} ${route} without token: ${show(res)}`);
        assert(!TENANT_ERROR.test(res.text), `${method} ${route}: tenant error`);
      }
    });

    await check('11. create-owner refuses an existing email without --reset-password; creates a new one; seed stays idempotent', async () => {
      const before = await PlatformUser.findById(userA.id).select('+passwordHash').lean();
      const refuse = run('npm', ['run', 'platform:create-owner', '--', '--email', userA.email, '--name', 'Someone'], {
        env: { PLATFORM_OWNER_PASSWORD: `Pw-${crypto.randomBytes(12).toString('hex')}` },
      });
      const refuseCode = await withTimeout(refuse.exited, 60000, 'create-owner (existing email)');
      assert(refuseCode === 1, `exit ${refuseCode}`);
      assert(/already exists/.test(refuse.output()), `no "already exists" message:\n${refuse.output().slice(-400)}`);
      const after = await PlatformUser.findById(userA.id).select('+passwordHash').lean();
      assert(after.passwordHash === before.passwordHash && (after.tokenVersion ?? 0) === (before.tokenVersion ?? 0)
        && String(after.updatedAt) === String(before.updatedAt), 'the existing user was changed');

      const newEmail = `verify-auth-${RUN}-created@example.invalid`;
      fixtures.push(newEmail);
      const create = run('npm', ['run', 'platform:create-owner', '--', '--email', newEmail, '--name', 'Verify Created', '--role', 'support'], {
        env: { PLATFORM_OWNER_PASSWORD: `Pw-${crypto.randomBytes(12).toString('hex')}` },
      });
      const createCode = await withTimeout(create.exited, 60000, 'create-owner (new email)');
      assert(createCode === 0, `create exit ${createCode}:\n${create.output().slice(-400)}`);
      const created = await PlatformUser.findOne({ email: newEmail }).lean();
      assert(created && created.role === 'support' && created.status === 'active' && (created.tokenVersion ?? 0) === 0,
        `created user: ${JSON.stringify(created)}`);
      const audit = await PlatformAuditLog.findOne({ action: 'platformUser.create', targetId: created._id }).lean();
      assert(audit && audit.actor.email === 'system' && audit.actor.userId === null, 'no platformUser.create audit entry by system');
      assert(!JSON.stringify(audit.after || {}).includes('passwordHash'), 'audit snapshot holds the password hash');

      const short = run('npm', ['run', 'platform:create-owner', '--', '--email', `x${newEmail}`, '--name', 'Short'], {
        env: { PLATFORM_OWNER_PASSWORD: 'too-short' },
      });
      assert(await withTimeout(short.exited, 60000, 'create-owner (short password)') === 1, 'a short password was accepted');

      for (const label of ['first', 'second']) {
        const seed = run('npm', ['run', 'platform:seed']);
        const seedCode = await withTimeout(seed.exited, 120000, `platform:seed (${label} run)`);
        assert(seedCode === 0, `seed ${label} run exit ${seedCode}:\n${seed.output().slice(-600)}`);
        if (label === 'second') {
          const summary = seed.lines.filter((l) => /^\s{2}\S+\s+created \d+/.test(l));
          console.log(summary.map((l) => `      ${l.trim()}`).join('\n'));
          assert(summary.length === 4, `expected 4 summary lines, got ${summary.length}`);
          const dirty = summary.filter((l) => !/created 0\b/.test(l) || /updated [1-9]/.test(l));
          assert(dirty.length === 0, `second run changed something: ${dirty.join(' | ')}`);
        }
      }
    });

    const companyEmail = process.env.VERIFY_COMPANY_EMAIL;
    if (companyEmail && tenant) {
      await check(`12. company user ${companyEmail} (tenant ${tenant}) still signs in with an emailed OTP and calls the tenant API`, async () => {
        const ip = nextIp();
        const since = server.lines.length;
        const send = await api(server, 'POST', '/api/auth/send-otp', { body: { email: companyEmail, purpose: 'login' }, tenant, ip });
        assert(send.status === 200, `send-otp: ${show(send)}`);
        const { code } = await waitForMail(server, { to: companyEmail.toLowerCase(), subject: /sign-in code/, since })
          .catch((err) => {
            throw new Error(`${err.message} (is the user active and email-verified in ${tenant}?)`);
          });
        const verify = await api(server, 'POST', '/api/auth/verify-otp', {
          body: { email: companyEmail, code, purpose: 'login' }, tenant, ip,
        });
        const tenantToken = verify.body?.data?.token;
        assert(verify.status === 200 && tenantToken, `verify-otp: ${show(verify)}`);
        const me = await api(server, 'GET', '/api/auth/me', { token: tenantToken, tenant });
        assert(me.status === 200 && me.body?.data?.user?.email === companyEmail.toLowerCase(), `GET /api/auth/me: ${show(me)}`);
        const platform = await api(server, 'GET', '/api/platform/auth/me', { token: tenantToken });
        assert(platform.status === 401 && platform.body?.code === 'PLATFORM_AUTH_REQUIRED', `tenant token on platform: ${show(platform)}`);
      });
    } else {
      console.log('SKIP  12. company OTP login (set VERIFY_COMPANY_EMAIL to an active, email-verified company user, '
        + 'and VERIFY_TENANT if it is not the first configured tenant)');
    }

    await check('13. platform_login_challenges has its TTL index; no new collections in any tenant database', async () => {
      const conn = getPlatformConnection();
      const indexes = await conn.db.collection('platform_login_challenges').indexes();
      const ttl = indexes.find((ix) => JSON.stringify(ix.key) === '{"expiresAt":1}');
      assert(ttl && ttl.expireAfterSeconds === 0, `TTL index: ${JSON.stringify(ttl)}`);
      const unique = indexes.find((ix) => JSON.stringify(ix.key) === '{"tokenHash":1}');
      assert(unique && unique.unique, 'tokenHash is not unique');

      const tenantsAfter = await tenantCollections();
      assert(tenantsAfter.size > 0, 'no tenant database could be inspected');
      const platformNames = new Set(PLATFORM_MODELS.map((m) => m.collection));
      for (const [dbName, { key, names }] of tenantsAfter) {
        assert(dbName !== getPlatformDbName(), `tenant ${key} uses the platform database`);
        const leaked = [...names].filter((n) => platformNames.has(n));
        assert(leaked.length === 0, `tenant DB ${dbName} contains ${leaked.join(', ')}`);
        const added = [...names].filter((n) => !tenantsBefore.get(dbName)?.names.has(n));
        assert(added.length === 0, `new collections in tenant DB ${dbName}: ${added.join(', ')}`);
      }
      console.log(`      tenant databases inspected: ${[...tenantsAfter.keys()].join(', ')}`);
    });

    await check('R. rate limits answer 429 { success:false, message, code:"RATE_LIMITED" }', async () => {
      const ip = nextIp();
      const email = `nobody-${RUN}@example.invalid`;
      const statuses = [];
      for (let i = 0; i < 6; i += 1) {
        statuses.push(await api(server, 'POST', '/api/platform/auth/login', { body: { email, password: 'wrong-password-123' }, ip }));
      }
      assert(statuses.slice(0, 5).every((r) => r.status === 401), `first 5 logins: ${statuses.map((r) => r.status).join(',')}`);
      const limited = statuses[5];
      assert(limited.status === 429 && limited.body?.code === 'RATE_LIMITED' && limited.body.success === false
        && typeof limited.body.message === 'string', `6th login (same IP + email): ${show(limited)}`);
      const otherEmail = await api(server, 'POST', '/api/platform/auth/login', {
        body: { email: `other-${email}`, password: 'wrong-password-123' }, ip,
      });
      assert(otherEmail.status === 401, `same IP, other email: ${show(otherEmail)}`);

      const otpIp = nextIp();
      const otp = [];
      for (let i = 0; i < 11; i += 1) {
        const routeName = i % 2 ? 'resend-otp' : 'verify-otp';
        otp.push(await api(server, 'POST', `/api/platform/auth/${routeName}`, {
          body: { challengeToken: 'f'.repeat(64), code: '000000' }, ip: otpIp,
        }));
      }
      assert(otp.slice(0, 10).every((r) => r.status === 401), `first 10 OTP calls: ${otp.map((r) => r.status).join(',')}`);
      assert(otp[10].status === 429 && otp[10].body?.code === 'RATE_LIMITED', `11th OTP call: ${show(otp[10])}`);
    });

    await check('L. the server log holds no platform code, challenge token or JWT', async () => {
      const log = server.output();
      const leaks = [];
      for (const line of log.split('\n')) {
        if (line.includes('EMAIL_DEV_LOG')) continue; // the dev-only mailer stub prints the email on purpose
        if (/eyJ[\w-]{10,}\.[\w-]{10,}\./.test(line)) leaks.push(`JWT: ${line.slice(0, 120)}`);
        if (/\b[a-f0-9]{64}\b/.test(line)) leaks.push(`64-hex token: ${line.slice(0, 120)}`);
      }
      assert(leaks.length === 0, leaks.join('\n      '));
    });
  } finally {
    await stopServer(server);
  }
};

(async () => {
  try {
    await main();
  } catch (err) {
    failures += 1;
    console.log(`FAIL  verify aborted: ${err.message}`);
  }
  try {
    if (fixtures.length) {
      const { PlatformUser, PlatformLoginChallenge } = getPlatformModels();
      const users = await PlatformUser.find({ email: { $in: fixtures } }, { _id: 1 }).lean();
      const ids = users.map((u) => u._id);
      await PlatformLoginChallenge.deleteMany({ userId: { $in: ids } });
      await PlatformUser.deleteMany({ _id: { $in: ids } });
      console.log(`\nRemoved ${ids.length} throwaway platform user(s); their audit entries stay (append-only).`);
    }
  } catch (err) {
    console.log(`Cleanup failed: ${err.message}`);
  }
  await closePlatformDb().catch(() => {});
  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
})();
