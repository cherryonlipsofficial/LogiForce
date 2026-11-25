/**
 * Read-only check of the platform 'tenants' records against the companies
 * that used to be hardcoded (legacyTenants.js).  npm run platform:check-tenants
 *
 * Run it with the same env as the server. For every legacy company it checks
 * that the record exists, is 'active', and resolves (through
 * config/tenants.js) to exactly the MongoDB URI the old hardcoded map resolves
 * to in this environment, i.e. the company keeps the same database.
 *
 * Comparing URIs rather than dbName labels is deliberate: the old map's dbName
 * was only a label (logi-force's said "logiforce_main" while MONGODB_URI points
 * at "logiforce"). The seed recorded the database each company really uses.
 *
 * Run it before setting MONGODB_BASE_URI in an environment that didn't have
 * it: once it is set, the old map sends logi-force to MONGODB_BASE_URI/
 * logiforce_main instead of MONGODB_URI, so this check (which replays the old
 * map) reports a mismatch even though the platform record is still right.
 *
 * Never writes, never prints a URI. Exits 1 if anything is wrong.
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });

const { connectPlatformDb, closePlatformDb, getPlatformDbName } = require('../db');
const { getPlatformModels } = require('../models');
const { mapTenantRecord } = require('../../config/tenants');
const { tenants: legacyTenants } = require('./legacyTenants');
const { dbNameFromUri } = require('./seedPlatform');

const uriSource = (record) => (record.dbUriEnv ? `env ${record.dbUriEnv}` : 'MONGODB_BASE_URI + dbName');

/**
 * @returns {Promise<{ problems: string[], warnings: string[], rows: object[] }>}
 * Requires an open platform connection.
 */
const checkLegacyTenantRecords = async () => {
  const { Tenant } = getPlatformModels();
  const records = await Tenant.find({}).lean();
  const byKey = new Map(records.map((r) => [r.key, r]));
  const problems = [];
  const warnings = [];
  const rows = [];

  for (const [key, legacy] of Object.entries(legacyTenants)) {
    const record = byKey.get(key);
    const row = {
      key,
      oldLabel: legacy.dbName,
      oldDatabase: legacy.dbUri ? dbNameFromUri(legacy.dbUri) : '-',
      recordDbName: record ? record.dbName : '-',
      status: record ? record.status : '-',
      uriFrom: record ? uriSource(record) : '-',
      sameDatabase: '-',
    };
    rows.push(row);

    if (!legacy.dbUri) {
      warnings.push(record
        ? `${key}: no URI is configured for it in this environment, so it was not compared (run with the server's env)`
        : `${key}: no URI configured here and no record; the old code could not serve it either`);
      continue;
    }
    if (!record) {
      problems.push(`${key}: no record in 'tenants'`);
      continue;
    }
    if (record.status !== 'active') problems.push(`${key}: status is '${record.status}', expected 'active'`);

    let resolved;
    try {
      resolved = mapTenantRecord(record).dbUri;
    } catch (err) {
      problems.push(`${key}: ${err.message}`);
      row.sameDatabase = 'NO';
      continue;
    }
    if (resolved === legacy.dbUri) {
      row.sameDatabase = 'yes';
    } else {
      row.sameDatabase = 'NO';
      problems.push(`${key}: the record resolves to a different MongoDB URI than today `
        + `(database "${dbNameFromUri(resolved)}" vs "${dbNameFromUri(legacy.dbUri)}")`);
    }
  }

  for (const record of records) {
    if (!(record.key in legacyTenants)) {
      warnings.push(`${record.key}: in 'tenants' but not in the legacy list (status '${record.status}'), not compared`);
    }
  }

  return { problems, warnings, rows };
};

const printReport = ({ problems, warnings, rows }, log = console.log) => {
  const cols = ['key', 'oldLabel', 'oldDatabase', 'recordDbName', 'status', 'uriFrom', 'sameDatabase'];
  const width = Object.fromEntries(cols.map((c) => [c, Math.max(c.length, ...rows.map((r) => String(r[c]).length))]));
  const line = (r) => cols.map((c) => String(r[c]).padEnd(width[c])).join('  ');
  log(line(Object.fromEntries(cols.map((c) => [c, c]))));
  rows.forEach((r) => log(line(r)));
  warnings.forEach((w) => log(`WARN  ${w}`));
  problems.forEach((p) => log(`FAIL  ${p}`));
};

if (require.main === module) {
  (async () => {
    let exitCode = 0;
    try {
      await connectPlatformDb();
      console.log(`Platform database: ${getPlatformDbName()}\n`);
      const result = await checkLegacyTenantRecords();
      printReport(result);
      exitCode = result.problems.length === 0 ? 0 : 1;
      console.log(exitCode === 0
        ? '\nOK: every legacy company resolves to the database it uses today.'
        : `\n${result.problems.length} problem(s). Do not deploy the platform tenant lookup until they are fixed.`);
    } catch (err) {
      console.error(`Check failed: ${err.message}`);
      exitCode = 1;
    }
    await closePlatformDb().catch(() => {});
    process.exit(exitCode);
  })();
}

module.exports = { checkLegacyTenantRecords, printReport };
