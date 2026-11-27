/**
 * scripts/migrateToPlatform.js against in-memory fakes (no MongoDB).  npm test
 *
 * The companies and roles below are made up. They cover: the admin role,
 * roles matching a template ignoring case/whitespace, the source company's
 * custom roles becoming templates, an unused and a used leftover tenant_admin
 * role, ambiguous matches, and a company still provisioning (left alone). The
 * script creates no company and no platform user, and needs --source.
 */
process.env.NODE_ENV = 'test';
process.env.APP_DOMAIN = 'logiforce.test';

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { idEq } = require('./helpers/fakeDb');
const { ROLE_TEMPLATES } = require('../src/config/defaultRoles');
const {
  normalizeRoleName, templateKeyFromRoleName, planCompanyRoles, migrate, parseArgs,
} = require('../src/scripts/migrateToPlatform');

const {
  buildWorld, makeDeps, role, adminRole, ALL_KEYS,
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
  test('parseArgs: --source required; dry run by default; --apply and --dry-run together are refused', () => {
    assert.throws(() => parseArgs([]), /--source <company key> is required/);
    assert.equal(parseArgs(['--source', 'alpha']).apply, false);
    assert.equal(parseArgs(['--source', 'alpha', '--apply']).apply, true);
    assert.throws(() => parseArgs(['--source', 'alpha', '--apply', '--dry-run']), /not both/);
    assert.equal(parseArgs(['--source', 'Alpha']).sourceKey, 'alpha');
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
    const { plan } = await migrate(deps, { log, sourceKey: 'alpha' });
    assert.equal(companyWrites(deps), 0);
    assert.equal(platformWrites(deps), 0);
    const out = logs.join('\n');
    assert.match(out, /DRY RUN/);
    assert.match(out, /\+ dispatcher: would create from role "Dispatcher"/);
    assert.match(out, /dropped \(platform-only or unknown\): roles\.manage, old\.unknown_key/);
    assert.match(out, /= delta: registered \(database logiforce_delta, provisioning\); status is "provisioning", skipped/);
    assert.doesNotMatch(out, /would create "/, 'no company is created');
    assert.match(out, /admin role "admin" .*3 user\(s\) keep it.*isSystemRole true → false/);
    assert.match(out, /- role "tenant_admin" .*would delete/);
    assert.match(out, /- admin: would delete/);
    assert.equal(plan.companies.length, 3);
  });

  test('apply: admin role updated in place, templates made, roles linked, the rest reported', async () => {
    const deps = makeDeps(world);
    const alphaAdminId = roleIn(deps, 'alpha_db', 'admin')._id;
    const { plan, failed } = await migrate(deps, { apply: true, log, sourceKey: 'alpha' });
    assert.deepEqual(failed, []);

    // admin role, same _id, its users untouched
    const alphaAdmin = roleIn(deps, 'alpha_db', 'admin');
    assert.ok(idEq(alphaAdmin._id, alphaAdminId));
    assert.equal(alphaAdmin.templateKey, 'tenant_admin');
    assert.equal(alphaAdmin.managedBy, 'platform');
    assert.equal(alphaAdmin.isSystemRole, false);
    assert.deepEqual(alphaAdmin.permissions, ALL_KEYS, 'permissions are the role sync\'s job, not the migration\'s');
    assert.equal(deps.companyModels.get('alpha_db').User.docs.filter((u) => idEq(u.roleId, alphaAdminId)).length, 3);

    // templates from alpha's custom roles; existing templates untouched
    const { RoleTemplate } = deps.models;
    const dispatcher = RoleTemplate.docs.find((t) => t.key === 'dispatcher');
    assert.deepEqual(dispatcher.permissions, ['drivers.view']);
    assert.ok(RoleTemplate.docs.find((t) => t.key === 'night_shift'));
    assert.equal(RoleTemplate.docs.find((t) => t.key === 'admin'), undefined, 'retired admin template not deleted');
    assert.equal(RoleTemplate.docs.find((t) => t.key === 'ops').version, 1);

    // alpha links
    assert.equal(roleIn(deps, 'alpha_db', ' Sales  ').templateKey, 'sales');
    assert.equal(roleIn(deps, 'alpha_db', 'accountant').templateKey, 'accountant');
    assert.equal(roleIn(deps, 'alpha_db', 'Dispatcher').templateKey, 'dispatcher');
    assert.equal(roleIn(deps, 'alpha_db', 'Night Shift').templateKey, 'night_shift');
    const alphaTenant = deps.models.Tenant.docs.find((t) => t.key === 'alpha');
    assert.ok(!alphaTenant.roleTemplateKeys.includes('admin'));
    for (const k of ['tenant_admin', 'dispatcher', 'night_shift']) assert.ok(alphaTenant.roleTemplateKeys.includes(k), k);

    // beta: unused leftover tenant_admin removed, OPS linked, the rest unmatched
    assert.equal(roleIn(deps, 'logiforce_beta', 'tenant_admin'), undefined);
    assert.equal(roleIn(deps, 'logiforce_beta', 'admin').templateKey, 'tenant_admin');
    assert.equal(roleIn(deps, 'logiforce_beta', 'OPS').templateKey, 'ops');
    const betaTenant = deps.models.Tenant.docs.find((t) => t.key === 'beta');
    assert.ok(!betaTenant.roleTemplateKeys.includes('dispatcher'), 'source-only templates must not spread to other companies');
    const unmatched = plan.companies.find((c) => c.tenant.key === 'beta').unmatched;
    assert.deepEqual(unmatched.map((u) => u.roleName).sort(), ['Fleet Supervisor', 'Night  shift', 'Viewer', 'viewer ']);
    assert.equal(unmatched.find((u) => u.roleName === 'Night  shift').suggestion, 'night_shift');
    assert.equal(unmatched.find((u) => u.roleName === 'Fleet Supervisor').users, 1);
    for (const name of ['Fleet Supervisor', 'Viewer', 'viewer ']) {
      assert.equal(roleIn(deps, 'logiforce_beta', name).templateKey, undefined, `${name} was changed`);
    }

    // gamma (suspended): migrated, but its admin is blocked by a tenant_admin role in use
    const gammaTenant = deps.models.Tenant.docs.find((t) => t.key === 'gamma');
    assert.equal(gammaTenant.status, 'suspended', 'status is not changed');
    assert.equal(roleIn(deps, 'logiforce_gamma', 'admin').isSystemRole, true);
    assert.match(logs.join('\n'), /"tenant_admin" \(1 user\(s\)\) already is the company's tenant_admin/);

    // delta (provisioning) is left alone; no company was created
    assert.ok(!plan.companies.some((c) => c.tenant.key === 'delta'));
    assert.equal(deps.models.Tenant.docs.length, 4);

    // audit
    const actions = deps.models.PlatformAuditLog.entries.map((e) => e.action);
    assert.ok(!actions.includes('tenant.create'));
    for (const a of ['roleTemplate.create', 'tenant.update', 'tenant.rolesMigrated', 'roleTemplate.delete']) {
      assert.ok(actions.includes(a), `no ${a} audit entry`);
    }
    assert.ok(deps.models.PlatformAuditLog.entries.every((e) => e.actor.email === 'system'));
  });

  test('a second apply changes nothing', async () => {
    const deps = makeDeps(world);
    await migrate(deps, { apply: true, log, sourceKey: 'alpha' });
    const before = { company: companyWrites(deps), platform: platformWrites(deps) };
    logs = [];
    const { plan } = await migrate(deps, { apply: true, log, sourceKey: 'alpha' });
    assert.equal(companyWrites(deps), before.company);
    assert.equal(platformWrites(deps), before.platform);
    assert.ok(plan.templates.fromCode.every((t) => t.exists));
    assert.deepEqual(plan.templates.fromSource.create, []);
    assert.ok(plan.companies.every((c) => !c.adminUpdate && !c.links.length && !c.removeRoles.length));
  });

  test('without --source nothing runs; an unregistered source is named', async () => {
    const deps = makeDeps(world);
    await assert.rejects(migrate(deps, { apply: true, log }), /--source <company key> is required/);
    await assert.rejects(migrate(deps, { apply: true, log, sourceKey: 'nobody' }), /source company "nobody" is not registered/);
    assert.equal(companyWrites(deps) + platformWrites(deps), 0);
  });

  test('a source company that cannot be read stops the run before anything is written', async () => {
    delete world.companies.alpha_db;
    const deps = makeDeps(world);
    await assert.rejects(migrate(deps, { apply: true, log, sourceKey: 'alpha' }), /cannot read the roles of source company "alpha"/);
    assert.equal(companyWrites(deps) + platformWrites(deps), 0);
  });
});

