/**
 * npm run platform:create-owner (Step 4), against in-memory fakes.  npm test
 */
process.env.NODE_ENV = 'test';
process.env.APP_DOMAIN = 'logiforce.test';
delete process.env.PLATFORM_CONSOLE_URL;

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { makeModel, clone } = require('./helpers/fakeDb');
const { systemRoleDocs, platformUserDoc } = require('./helpers/platformRoles');

const platformModels = require('../src/platform/models');
const platform = {};
platformModels.getPlatformModels = () => platform;

const { parseArgs, bootstrapOwner, recoverOwner } = require('../src/platform/scripts/createPlatformOwner');

let rolesEnsured;
const ensureRoles = async () => {
  rolesEnsured += 1;
  if (!platform.PlatformRole.docs.length) platform.PlatformRole.docs.push(...systemRoleDocs());
};
const quiet = () => {};

beforeEach(() => {
  rolesEnsured = 0;
  platform.PlatformRole = makeModel([], { unique: ['key'] });
  platform.PlatformUser = makeModel([], { unique: ['email'], onCreate: (d) => { d.tokenVersion ??= 0; } });
  platform.PlatformAuditLog = makeModel([]);
  platform.PlatformAuditLog.record = async ({ req, ...e }) => { platform.PlatformAuditLog.docs.push(clone(e)); };
  platform.Tenant = makeModel([]);
});

describe('create-owner', () => {
  test('a password is never an argument', () => {
    assert.throws(() => parseArgs(['--email', 'a@b.co', '--password', 'x']), /never taken as an argument/);
    assert.throws(() => parseArgs(['--password=x']), /never taken as an argument/);
    assert.deepEqual(parseArgs(['--email', 'a@b.co', '--name', 'A', '--link']), { resetPassword: false, link: true, email: 'a@b.co', name: 'A' });
  });

  test('fresh platform: seeds roles, creates the Owner without a password, prints a 24h link, audits', async () => {
    const { user, link } = await bootstrapOwner({ email: 'Me@Example.com', name: 'Me', useLink: true, ensureRoles, log: quiet });
    assert.equal(rolesEnsured, 1);
    assert.equal(user.email, 'me@example.com');
    const stored = platform.PlatformUser.docs[0];
    assert.equal(stored.roleKey, 'platform_owner');
    assert.equal(stored.isActive, true);
    assert.equal(stored.passwordHash, null);
    assert.match(link.url, /^https:\/\/admin\.logiforce\.test\/set-password\/[a-f0-9]{64}$/);
    const hours = (link.expiresAt - Date.now()) / 3600000;
    assert.ok(hours > 23.9 && hours <= 24, `${hours}h`);
    assert.notEqual(stored.passwordSetTokenHash, link.url.split('/').pop(), 'only the hash is stored');
    const actions = platform.PlatformAuditLog.docs.map((e) => e.action);
    assert.ok(actions.includes('platformUser.create') && actions.includes('platform.ownerBootstrap'));
    assert.equal(platform.Tenant.docs.length, 0, 'no company is created');
  });

  test('refuses when an active Owner exists, and changes nothing', async () => {
    platform.PlatformUser.docs.push(platformUserDoc('platform_owner'));
    await assert.rejects(
      bootstrapOwner({ email: 'second@example.com', name: 'S', useLink: true, ensureRoles, log: quiet }),
      /active Platform Owner already exists/
    );
    assert.equal(platform.PlatformUser.docs.length, 1);
    assert.equal(rolesEnsured, 0);
    assert.equal(platform.PlatformAuditLog.docs.length, 0);
  });

  test('an inactive Owner does not block the bootstrap', async () => {
    platform.PlatformUser.docs.push(platformUserDoc('platform_owner', { isActive: false }));
    await bootstrapOwner({ email: 'new@example.com', name: 'N', useLink: true, ensureRoles, log: quiet });
    assert.equal(platform.PlatformUser.docs.length, 2);
  });

  test('recovery: an existing Owner gets a new link and their sessions end; others are refused', async () => {
    const owner = platformUserDoc('platform_owner', { email: 'o@example.com' });
    const support = platformUserDoc('platform_support', { email: 's@example.com' });
    platform.PlatformUser.docs.push(owner, support);
    const { link } = await recoverOwner({ email: 'o@example.com', useLink: true });
    assert.match(link.url, /\/set-password\/[a-f0-9]{64}$/);
    assert.equal(platform.PlatformUser.docs[0].tokenVersion, 1);
    await assert.rejects(recoverOwner({ email: 's@example.com', useLink: true }), /not a Platform Owner/);
  });
});
