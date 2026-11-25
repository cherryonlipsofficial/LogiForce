/**
 * Copy platform role templates into company databases.  npm run platform:sync-roles
 *
 *   npm run platform:sync-roles -- --tenant <key>   one company
 *   npm run platform:sync-roles -- --all            every company, whatever its status
 *   add --apply to write
 *
 * DRY RUN BY DEFAULT: prints what would change and writes nothing (not even
 * indexes). With --apply it writes each company's roles and one
 * 'tenant.rolesSynced' entry in platform_audit_logs per company, as actor 'system'.
 *
 * For each company it prints the roles created / updated / unchanged /
 * switched off, the permission changes, name conflicts (those templates are
 * skipped), and how many users point at a switched-off role.
 *
 * Exits 1 if a company is unknown or its sync failed. Never prints a URI.
 * See platform/services/roleSync.service.js for the rules.
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });

const { connectPlatformDb, closePlatformDb, getPlatformDbName } = require('../db');
const { getPlatformModels } = require('../models');
const { closeAllConnections } = require('../../config/connectionManager');
const { redactUris } = require('../../config/tenants');
const { syncTenantRoles } = require('../services/roleSync.service');
const { SYSTEM_ACTOR } = require('../services/platformUser.service');

const USAGE = 'Usage: npm run platform:sync-roles -- (--tenant <key> | --all) [--apply]';

const parseArgs = (argv) => {
  const args = { tenant: null, all: false, apply: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--all') args.all = true;
    else if (arg === '--apply') args.apply = true;
    else if (arg === '--tenant') {
      args.tenant = argv[i + 1];
      i += 1;
      if (!args.tenant || args.tenant.startsWith('--')) throw new Error('--tenant needs a company key');
    } else if (arg.startsWith('--tenant=')) {
      args.tenant = arg.slice('--tenant='.length);
      if (!args.tenant) throw new Error('--tenant needs a company key');
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!!args.tenant === args.all) throw new Error('Pass exactly one of --tenant <key> or --all');
  return args;
};

const list = (names) => (names.length ? names.join(', ') : '-');

const printSummary = (tenant, s, log) => {
  log(`\n${tenant.key}  (database ${tenant.dbName}, status ${tenant.status})`);
  log(`  created      ${list(s.created)}`);
  log(`  updated      ${list(s.updated)}`);
  log(`  unchanged    ${list(s.unchanged)}`);
  log(`  switched off ${list(s.deactivated)}`);
  if (s.missingTemplates.length) {
    log(`  WARNING: no RoleTemplate for ${s.missingTemplates.join(', ')} (in roleTemplateKeys); skipped`);
  }
  if (s.conflicts.length) {
    log('  CONFLICTS (template skipped for this company):');
    for (const c of s.conflicts) log(`    ${c.templateKey}: ${c.reason}`);
  } else {
    log('  conflicts    -');
  }
  log(`  users on switched-off roles: ${s.usersOnDeactivatedRoles}`);

  const names = [...s.created, ...s.updated];
  if (names.length) log(`  ${s.dryRun ? 'planned changes' : 'changes'}:`);
  for (const name of names) {
    const c = s.changes[name];
    if (s.created.includes(name)) {
      log(`    + ${name}: new role, ${c.permissionsAdded.length} permission(s)`);
      continue;
    }
    const fields = c.fields.filter((f) => f !== 'permissions');
    const parts = [];
    if (c.adopted) parts.push('taken over by the platform (role predates role templates)');
    if (fields.length) parts.push(`sets ${fields.join(', ')}`);
    if (c.fields.includes('permissions')) {
      parts.push(`+${c.permissionsAdded.length} / -${c.permissionsRemoved.length} permission(s)`);
    }
    log(`    ~ ${name}: ${parts.join('; ')}`);
    if (c.permissionsAdded.length) log(`        added:   ${c.permissionsAdded.join(', ')}`);
    if (c.permissionsRemoved.length) log(`        removed: ${c.permissionsRemoved.join(', ')}`);
  }
  for (const name of s.deactivated) log(`    - ${name}: isActive false (kept; its users still point at it)`);
};

const run = async (args, log = console.log) => {
  const { Tenant } = getPlatformModels();
  const tenants = args.all
    ? await Tenant.find({}).sort({ key: 1 }).lean()
    : await Tenant.find({ key: String(args.tenant).trim().toLowerCase() }).lean();

  if (!args.all && tenants.length === 0) throw new Error(`No company with key "${args.tenant}"`);

  log(`Platform database: ${getPlatformDbName()}`);
  log(args.apply
    ? `APPLY: writing roles for ${tenants.length} company(ies)`
    : `DRY RUN for ${tenants.length} company(ies): nothing is written. Add --apply to write.`);

  const failed = [];
  const totals = { created: 0, updated: 0, unchanged: 0, deactivated: 0, conflicts: 0, usersOnDeactivatedRoles: 0 };

  for (const tenant of tenants) {
    try {
      const summary = await syncTenantRoles(tenant, { dryRun: !args.apply, actor: SYSTEM_ACTOR });
      printSummary(tenant, summary, log);
      for (const k of ['created', 'updated', 'unchanged', 'deactivated', 'conflicts']) totals[k] += summary[k].length;
      totals.usersOnDeactivatedRoles += summary.usersOnDeactivatedRoles;
    } catch (err) {
      failed.push(tenant.key);
      log(`\n${tenant.key}  FAILED: ${redactUris(err?.message)}`);
    }
  }

  log(`\nTotal: created ${totals.created}  updated ${totals.updated}  unchanged ${totals.unchanged}  `
    + `switched off ${totals.deactivated}  conflicts ${totals.conflicts}  `
    + `users on switched-off roles ${totals.usersOnDeactivatedRoles}`);
  if (failed.length) log(`Failed: ${failed.join(', ')}`);
  if (!args.apply) log('Dry run: nothing was written. Re-run with --apply to write.');
  return { failed };
};

if (require.main === module) {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`${err.message}\n${USAGE}`);
    process.exit(2);
  }

  (async () => {
    let code = 0;
    try {
      await connectPlatformDb();
      const { failed } = await run(args);
      code = failed.length ? 1 : 0;
    } catch (err) {
      console.error(`Role sync failed: ${redactUris(err?.message)}`);
      code = 1;
    }
    await closeAllConnections().catch(() => {});
    await closePlatformDb().catch(() => {});
    process.exit(code);
  })();
}

module.exports = { parseArgs, run };
