/**
 * scripts/migrateToPlatform.js against in-memory fakes (no MongoDB).  npm test
 *
 * The companies and roles below are made up. They cover: the admin role,
 * roles matching a template ignoring case/whitespace, the source company's
 * custom roles becoming templates, an unused and a used leftover tenant_admin
 * role, ambiguous matches, a company that isn't registered yet and one with no
 * URI configured, and the platform account.
 */
process.env.NODE_ENV = 'test';

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { idEq } = require('./helpers/fakeDb');
const { MODULES } = require('../src/config/permissions');
const { ROLE_TEMPLATES } = require('../src/config/defaultRoles');
const {
  normalizeRoleName, templateKeyFromRoleName, planCompanyRoles, migrate, parseArgs,
} = require('../src/scripts/migrateToPlatform');

const {
  buildWorld, makeDeps, role, adminRole, oid, ALL_KEYS,
} = require('./helpers/migrationFixture');

const companyWrites = (deps) => [...deps.companyModels.values()].reduce((n, c) => n + c.Role.writes + c.User.writes, 0);
const platformWrites = (deps) => Object.values(deps.models).reduce((n, m) => n + (m.writes || 0) + (m.entries?.length || 0), 0);
const roleIn = (deps, dbName, name) => deps.companyModels.get(dbName).Role.docs.find((r) => r.name === name);

describe('helpers', () => {
  test('normalizeRoleName ignores case and extra whitespace only', () => {
    assert.equal(normalizeRoleName('  Night   Shift '), 'night shift');
    assert.equal(normalizeRoleName('OPS'), 'ops');
    assert.notEqual(normalizeRoleName('night_shift'), normalizeRoleName('Night Shift'));
  });
  test('templateKeyFromRoleName', () => {
    assert.equal(templateKeyFromRoleName('Night Shift'), 'night_shift');
    assert.equal(templateKeyFromRoleName(' Field-Ops 2 '), 'field_ops_2');
    assert.equal(templateKeyFromRoleName('2nd shift'), null);
    assert.equal(templateKeyFromRoleName('x'), null);
  });
  test('parseArgs: dry run by default; --apply and --dry-run together are refused', () => {
    assert.equal(parseArgs([]).apply, false);
    assert.equal(parseArgs(['--apply']).apply, true);
    assert.throws(() => parseArgs(['--apply', '--dry-run']), /not both/);
    assert.equal(parseArgs(['--source', 'ClientA']).sourceKey, 'clienta');
    assert.throws(() => parseArgs(['--nope']), /Unknown argument/);
  });
});

describe('planCompanyRoles', () => {
  test('a company with two system roles is a blocker; nothing is changed for the admin', () => {
    const plan = planCompanyRoles({
      roles: [adminRole(), role('root', { isSystemRole: true })],
      userCounts: new Map(),
      templates: ROLE_TEMPLATES.map((t) => ({ key: t.key, displayName: t.displayName })),
      roleTemplateKeys: ['admin', 'ops'],
    });
    assert.equal(plan.adminUpdate, null);
    assert.equal(plan.blockers.length, 1);
    assert.deepEqual(plan.roleTemplateKeys.after, ['ops']);
  });
});

describe('migrate', () => {
  let world;
  let logs;
  const log = (line) => logs.push(line);
  beforeEach(() => {
    world = buildWorld();
    logs = [];
  });

  test('dry run (the default) writes nothing and prints every planned change', async () => {
    const deps = makeDeps(world);
    const { plan } = await migrate(deps, { log });
    assert.equal(companyWrites(deps), 0);
    assert.equal(platformWrites(deps), 0);
    const out = logs.join('\n');
    assert.match(out, /DRY RUN/);
    assert.match(out, /\+ dispatcher: would create from role "Dispatcher"/);
    assert.match(out, /dropped \(platform-only or unknown\): roles\.manage, old\.unknown_key/);
    assert.match(out, /\+ clientb: would create "Client B Logistics", active, database logiforce_clientb/);
    assert.match(out, /company clientc: no MongoDB URI/);
    assert.match(out, /admin role "admin" .*3 user\(s\) keep it.*isSystemRole true → false/);
    assert.match(out, /- role "tenant_admin" .*would delete/);
    assert.match(out, /- admin: would delete/);
    assert.match(out, /owner@platform\.test \("Platform Owner", owner\): would create/);
    assert.equal(plan.companies.length, 3);
  });

  test('apply: admin role updated in place, templates made, roles linked, the rest reported', async () => {
    const deps = makeDeps(world);
    const lfAdminId = roleIn(deps, 'logiforce', 'admin')._id;
    const { plan, failed } = await migrate(deps, { apply: true, log });
    assert.deepEqual(failed, []);

    // admin role, same _id, its users untouched
    const lfAdmin = roleIn(deps, 'logiforce', 'admin');
    assert.ok(idEq(lfAdmin._id, lfAdminId));
    assert.equal(lfAdmin.templateKey, 'tenant_admin');
    assert.equal(lfAdmin.managedBy, 'platform');
    assert.equal(lfAdmin.isSystemRole, false);
    assert.deepEqual(lfAdmin.permissions, ALL_KEYS, 'permissions are the role sync\'s job, not the migration\'s');
    assert.equal(deps.companyModels.get('logiforce').User.docs.filter((u) => idEq(u.roleId, lfAdminId)).length, 3);

    // templates from logi-force's custom roles; existing templates untouched
    const { RoleTemplate } = deps.models;
    const dispatcher = RoleTemplate.docs.find((t) => t.key === 'dispatcher');
    assert.deepEqual(dispatcher.permissions, ['drivers.view']);
    assert.ok(RoleTemplate.docs.find((t) => t.key === 'night_shift'));
    assert.equal(RoleTemplate.docs.find((t) => t.key === 'admin'), undefined, 'retired admin template not deleted');
    assert.equal(RoleTemplate.docs.find((t) => t.key === 'ops').version, 1);

    // logi-force links
    assert.equal(roleIn(deps, 'logiforce', ' Sales  ').templateKey, 'sales');
    assert.equal(roleIn(deps, 'logiforce', 'accountant').templateKey, 'accountant');
    assert.equal(roleIn(deps, 'logiforce', 'Dispatcher').templateKey, 'dispatcher');
    assert.equal(roleIn(deps, 'logiforce', 'Night Shift').templateKey, 'night_shift');
    const lfTenant = deps.models.Tenant.docs.find((t) => t.key === 'logi-force');
    assert.ok(!lfTenant.roleTemplateKeys.includes('admin'));
    for (const k of ['tenant_admin', 'dispatcher', 'night_shift']) assert.ok(lfTenant.roleTemplateKeys.includes(k), k);

    // clienta: unused leftover tenant_admin removed, OPS linked, the rest unmatched
    assert.equal(roleIn(deps, 'logiforce_clienta', 'tenant_admin'), undefined);
    assert.equal(roleIn(deps, 'logiforce_clienta', 'admin').templateKey, 'tenant_admin');
    assert.equal(roleIn(deps, 'logiforce_clienta', 'OPS').templateKey, 'ops');
    const caTenant = deps.models.Tenant.docs.find((t) => t.key === 'clienta');
    assert.ok(!caTenant.roleTemplateKeys.includes('dispatcher'), 'source-only templates must not spread to other companies');
    const unmatched = plan.companies.find((c) => c.tenant.key === 'clienta').unmatched;
    assert.deepEqual(unmatched.map((u) => u.roleName).sort(), ['Fleet Supervisor', 'Night  shift', 'Viewer', 'viewer ']);
    assert.equal(unmatched.find((u) => u.roleName === 'Night  shift').suggestion, 'night_shift');
    assert.equal(unmatched.find((u) => u.roleName === 'Fleet Supervisor').users, 1);
    for (const name of ['Fleet Supervisor', 'Viewer', 'viewer ']) {
      assert.equal(roleIn(deps, 'logiforce_clienta', name).templateKey, undefined, `${name} was changed`);
    }

    // clientb: registered, but its admin is blocked by a tenant_admin role in use
    const cbTenant = deps.models.Tenant.docs.find((t) => t.key === 'clientb');
    assert.equal(cbTenant.status, 'active');
    assert.deepEqual(cbTenant.enabledModules, [...MODULES]);
    assert.equal(roleIn(deps, 'logiforce_clientb', 'admin').isSystemRole, true);
    assert.match(logs.join('\n'), /"tenant_admin" \(1 user\(s\)\) already is the company's tenant_admin/);
    assert.equal(deps.models.Tenant.docs.find((t) => t.key === 'clientc'), undefined);

    // platform account
    const owner = deps.models.PlatformUser.docs.find((u) => u.email === 'owner@platform.test');
    assert.equal(owner.role, 'owner');
    assert.equal(owner.passwordHash, null);
    assert.deepEqual(deps.sent, [String(owner._id)]);

    // audit
    const actions = deps.models.PlatformAuditLog.entries.map((e) => e.action);
    for (const a of ['roleTemplate.create', 'tenant.create', 'tenant.update', 'tenant.rolesMigrated', 'roleTemplate.delete']) {
      assert.ok(actions.includes(a), `no ${a} audit entry`);
    }
    assert.ok(deps.models.PlatformAuditLog.entries.every((e) => e.actor.email === 'system'));
  });

  test('a second apply changes nothing', async () => {
    const deps = makeDeps(world);
    await migrate(deps, { apply: true, log });
    const before = { company: companyWrites(deps), platform: platformWrites(deps), sent: deps.sent.length };
    logs = [];
    const { plan } = await migrate(deps, { apply: true, log });
    assert.equal(companyWrites(deps), before.company);
    assert.equal(platformWrites(deps), before.platform);
    assert.equal(deps.sent.length, before.sent, 'set-password link sent again');
    assert.ok(plan.templates.fromCode.every((t) => t.exists));
    assert.deepEqual(plan.templates.fromSource.create, []);
    assert.ok(plan.companies.every((c) => !c.adminUpdate && !c.links.length && !c.removeRoles.length));
    assert.match(logs.join('\n'), /skipped: a set-password link was sent/);
  });

  test('--apply refuses to write anything when the set-password link could not be sent', async () => {
    const deps = makeDeps(world, {
      platformUsers: { ...makeDeps(world).platformUsers, consoleUrlProblem: () => 'PLATFORM_CONSOLE_URL is not set' },
    });
    await assert.rejects(migrate(deps, { apply: true, log }), /Nothing was written/);
    assert.equal(companyWrites(deps), 0);
    assert.equal(platformWrites(deps), 0);
  });

  test('without PLATFORM_ADMIN_* the account step is skipped, everything else runs', async () => {
    const deps = makeDeps(world, { platformAccount: { email: '', name: '' } });
    const { failed } = await migrate(deps, { apply: true, log });
    assert.deepEqual(failed, []);
    assert.equal(deps.models.PlatformUser.docs.length, 0);
    assert.match(logs.join('\n'), /PLATFORM_ADMIN_EMAIL and PLATFORM_ADMIN_NAME must both be set/);
  });

  test('an existing account with a password is left alone', async () => {
    world.platformUsers = [{ _id: oid(), email: 'owner@platform.test', name: 'Owner', role: 'owner', passwordHash: '$2a$12$x' }];
    const deps = makeDeps(world);
    await migrate(deps, { apply: true, log });
    assert.deepEqual(deps.sent, []);
  });

  test('a source company that cannot be read stops the run before anything is written', async () => {
    delete world.companies.logiforce;
    const deps = makeDeps(world);
    await assert.rejects(migrate(deps, { apply: true, log }), /cannot read the roles of source company "logi-force"/);
    assert.equal(companyWrites(deps) + platformWrites(deps), 0);
  });
});

