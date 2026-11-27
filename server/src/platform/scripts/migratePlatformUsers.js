/**
 * Move platform users from the old fixed roles to platform roles.
 *
 *   npm run platform:migrate-users              dry run: prints what would change
 *   npm run platform:migrate-users -- --apply   makes the changes
 *
 * Before platform roles existed a platform user had `role: 'owner'|'support'`
 * and `status: 'active'|'disabled'`. This sets `roleKey` (platform_owner /
 * platform_support) and `isActive` from them and removes the old fields.
 * Users that already have a roleKey are left alone, so it is safe to run again.
 *
 * Run `npm run platform:seed` first so both roles exist. Touches only the
 * platform_users collection of the platform database; never a company database.
 * Every change is audited as actor 'system'. Never prints a password.
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });

const { connectPlatformDb, closePlatformDb } = require('../db');
const { getPlatformModels } = require('../models');
const { PLATFORM_OWNER_ROLE_KEY, PLATFORM_SUPPORT_ROLE_KEY } = require('../../config/platformPermissions');

const SYSTEM_ACTOR = Object.freeze({ userId: null, email: 'system' });

const LEGACY_ROLE_MAP = Object.freeze({ owner: PLATFORM_OWNER_ROLE_KEY, support: PLATFORM_SUPPORT_ROLE_KEY });

/** The new fields for one legacy user document, or null if it needs nothing. */
const planUser = (doc) => {
  if (doc.roleKey) return null;
  const roleKey = LEGACY_ROLE_MAP[doc.role];
  if (!roleKey) return { error: `unknown old role "${doc.role}"` };
  return { roleKey, isActive: doc.status !== 'disabled' };
};

const migratePlatformUsers = async ({ apply = false, log = console.log } = {}) => {
  const { PlatformUser, PlatformRole, PlatformAuditLog } = getPlatformModels();
  const roles = await PlatformRole.find({ key: { $in: Object.values(LEGACY_ROLE_MAP) } }).select('key').lean();
  const missing = Object.values(LEGACY_ROLE_MAP).filter((k) => !roles.some((r) => r.key === k));
  if (missing.length) throw new Error(`platform role(s) missing: ${missing.join(', ')}. Run npm run platform:seed first.`);

  // Raw collection: the schema no longer has `role` / `status`.
  const docs = await PlatformUser.collection.find({ roleKey: { $exists: false } }).toArray();
  const summary = { changed: 0, skipped: 0, errors: 0 };
  for (const doc of docs) {
    const plan = planUser(doc);
    if (!plan) { summary.skipped += 1; continue; }
    if (plan.error) {
      summary.errors += 1;
      log(`  ${doc.email}: ${plan.error}; left alone`);
      continue;
    }
    log(`  ${doc.email}: role ${doc.role} → ${plan.roleKey}, ${plan.isActive ? 'active' : 'inactive'}`);
    summary.changed += 1;
    if (!apply) continue;
    await PlatformUser.collection.updateOne(
      { _id: doc._id, roleKey: { $exists: false } },
      { $set: plan, $unset: { role: '', status: '' } }
    );
    await PlatformAuditLog.record({
      actor: SYSTEM_ACTOR,
      action: 'platformUser.migrated',
      targetType: 'PlatformUser',
      targetId: doc._id,
      targetKey: doc.email,
      before: { role: doc.role, status: doc.status },
      after: plan,
    });
  }
  log(`${apply ? 'Changed' : 'Would change'} ${summary.changed}, skipped ${summary.skipped}, errors ${summary.errors}.`);
  return summary;
};

if (require.main === module) {
  (async () => {
    const apply = process.argv.includes('--apply');
    try {
      await connectPlatformDb();
      if (!apply) console.log('Dry run. Nothing is written; add --apply to make the changes.');
      const summary = await migratePlatformUsers({ apply });
      await closePlatformDb();
      process.exit(summary.errors ? 1 : 0);
    } catch (err) {
      console.error(`Platform user migration failed: ${err.message}`);
      await closePlatformDb().catch(() => {});
      process.exit(1);
    }
  })();
}

module.exports = { migratePlatformUsers, planUser };
