/**
 * Invited platform users and the set-password link (used by migrateToPlatform's
 * platform account step).  npm test
 *
 * No MongoDB: platform models are in-memory fakes; the email is stubbed.
 */
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'tenant-secret-for-tests-only-000000000000';
process.env.PLATFORM_JWT_SECRET = 'platform-secret-for-tests-only-11111111111';

require('express-async-errors');
const { test, describe, beforeEach, before, after } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { makeModel, clone } = require('./helpers/fakeDb');

const platformModels = require('../src/platform/models');
const platform = {};
platformModels.getPlatformModels = () => platform; // before requiring anything that destructures it

const platformMailer = require('../src/platform/services/platformMailer');
const users = require('../src/platform/services/platformUser.service');

const mail = { sent: [], failNext: false };
platformMailer.sendPlatformSetPasswordEmail = async (message) => {
  if (mail.failNext) {
    mail.failNext = false;
    throw new Error('Resend rejected the email');
  }
  mail.sent.push(message);
};

const tokenFrom = (url) => url.split('/set-password/')[1];
const PASSWORD = 'a-long-enough-password';

beforeEach(() => {
  platform.PlatformUser = makeModel([], { unique: ['email'], onCreate: (d) => { d.tokenVersion ??= 0; } });
  platform.PlatformLoginChallenge = makeModel([]);
  platform.PlatformAuditLog = { entries: [], record: async ({ req, ...e }) => { platform.PlatformAuditLog.entries.push(clone(e)); } };
  mail.sent = [];
  mail.failNext = false;
  process.env.PLATFORM_CONSOLE_URL = 'https://platform.logiforce.test/';
});

describe('set-password link', () => {
  test('invite → link → set password: one use only, session version bumped, audited', async () => {
    const user = await users.createInvitedPlatformUser({ email: 'me@platform.test', name: 'Me', roleKey: 'platform_owner' });
    assert.equal(platform.PlatformUser.docs[0].passwordHash, null);
    assert.equal(platform.PlatformUser.docs[0].roleKey, 'platform_owner');

    const { expiresAt } = await users.sendPlatformSetPasswordLink({ userId: user._id });
    assert.equal(mail.sent.length, 1);
    assert.match(mail.sent[0].url, /^https:\/\/platform\.logiforce\.test\/set-password\/[a-f0-9]{64}$/);
    assert.ok(expiresAt - Date.now() > 23 * 3600 * 1000);
    const token = tokenFrom(mail.sent[0].url);
    assert.notEqual(platform.PlatformUser.docs[0].passwordSetTokenHash, token, 'token stored in clear');

    assert.deepEqual((await users.checkPlatformSetPasswordToken(token)).email, 'me@platform.test');
    await assert.rejects(users.setPlatformPasswordWithToken({ token, password: 'short' }), (err) => err.status === 400 && /12 characters/.test(err.message));

    await users.setPlatformPasswordWithToken({ token, password: PASSWORD });
    const stored = platform.PlatformUser.docs[0];
    assert.ok(await bcrypt.compare(PASSWORD, stored.passwordHash));
    assert.equal(stored.passwordSetTokenHash, null);
    assert.equal(stored.tokenVersion, 1);

    await assert.rejects(users.setPlatformPasswordWithToken({ token, password: PASSWORD }), (err) => err.code === 'SET_PASSWORD_LINK_INVALID');
    await assert.rejects(users.checkPlatformSetPasswordToken(token), (err) => err.code === 'SET_PASSWORD_LINK_INVALID');
    assert.deepEqual(platform.PlatformAuditLog.entries.map((e) => e.action),
      ['platformUser.create', 'platformUser.set_password_link_sent', 'platformUser.password_set']);
    assert.ok(JSON.stringify(platform.PlatformAuditLog.entries).indexOf(token) === -1, 'token in the audit log');
  });

  test('an expired link is refused', async () => {
    const user = await users.createInvitedPlatformUser({ email: 'me@platform.test', name: 'Me', roleKey: 'platform_owner' });
    await users.sendPlatformSetPasswordLink({ userId: user._id });
    platform.PlatformUser.docs[0].passwordSetExpires = new Date(Date.now() - 1000);
    await assert.rejects(users.setPlatformPasswordWithToken({ token: tokenFrom(mail.sent[0].url), password: PASSWORD }), /invalid or has expired/);
  });

  test('no PLATFORM_CONSOLE_URL and no APP_DOMAIN: nothing stored, clear error', async () => {
    delete process.env.PLATFORM_CONSOLE_URL;
    delete process.env.APP_DOMAIN;
    const user = await users.createInvitedPlatformUser({ email: 'me@platform.test', name: 'Me', roleKey: 'platform_owner' });
    await assert.rejects(users.sendPlatformSetPasswordLink({ userId: user._id }), /Neither PLATFORM_CONSOLE_URL nor APP_DOMAIN is set/);
    assert.equal(platform.PlatformUser.docs[0].passwordSetTokenHash, undefined);
  });

  test('a failed email removes the token again', async () => {
    const user = await users.createInvitedPlatformUser({ email: 'me@platform.test', name: 'Me', roleKey: 'platform_owner' });
    mail.failNext = true;
    await assert.rejects(users.sendPlatformSetPasswordLink({ userId: user._id }), /Could not send/);
    assert.equal(platform.PlatformUser.docs[0].passwordSetTokenHash, null);
  });
});

describe('HTTP: /api/platform/auth/set-password (public)', () => {
  let server;
  let base;
  before(async () => {
    const express = require('express');
    const app = express();
    app.use(express.json());
    app.use('/api/platform', require('../src/platform/platform.routes'));
    await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
    base = `http://127.0.0.1:${server.address().port}/api/platform/auth/set-password`;
  });
  after(() => new Promise((resolve) => server.close(resolve)));

  test('GET checks the link, POST uses it once', async () => {
    const user = await users.createInvitedPlatformUser({ email: 'me@platform.test', name: 'Me', roleKey: 'platform_owner' });
    await users.sendPlatformSetPasswordLink({ userId: user._id });
    const token = tokenFrom(mail.sent[0].url);

    const check = await fetch(`${base}/${token}`);
    assert.equal(check.status, 200);
    assert.equal((await check.json()).email, 'me@platform.test');
    assert.equal((await fetch(`${base}/${'0'.repeat(64)}`)).status, 400);

    const post = (body) => fetch(base, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal((await post({ token, password: 'short' })).status, 400);
    const ok = await post({ token, password: PASSWORD });
    assert.equal(ok.status, 200);
    assert.deepEqual(await ok.json(), { success: true, email: 'me@platform.test' });
    const again = await post({ token, password: PASSWORD });
    assert.equal(again.status, 400);
    assert.equal((await again.json()).code, 'SET_PASSWORD_LINK_INVALID');
  });
});
