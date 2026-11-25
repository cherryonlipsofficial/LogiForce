/**
 * Platform user accounts: create, and reset a password.
 *
 * Used by `npm run platform:create-owner` and by step 3 of the platform seed.
 * Every change is written to platform_audit_logs. Never logs a password.
 */
const { getPlatformModels } = require('../models');

const SYSTEM_ACTOR = Object.freeze({ userId: null, email: 'system' });

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

const findPlatformUserByEmail = (email) => {
  const { PlatformUser } = getPlatformModels();
  return PlatformUser.findOne({ email: normalizeEmail(email) });
};

/**
 * Create a platform user and audit 'platformUser.create'.
 * Throws on validation errors, a short password (setPassword needs 12+
 * characters) or a duplicate email.
 *
 * @returns {Promise<import('mongoose').Document>} the saved user (passwordHash not exposed by toJSON)
 */
const createPlatformUser = async ({
  email, name, password, role = 'owner', status = 'active', actor = SYSTEM_ACTOR, req,
}) => {
  const { PlatformUser, PlatformAuditLog } = getPlatformModels();

  const user = new PlatformUser({ email, name, role, status });
  await user.setPassword(password);
  await user.save();

  await PlatformAuditLog.record({
    actor,
    action: 'platformUser.create',
    targetType: 'PlatformUser',
    targetId: user._id,
    targetKey: user.email,
    before: null,
    after: user.toJSON(),
    req,
  });

  return user;
};

/**
 * Set a new password, increment tokenVersion (every existing platform session
 * stops working) and drop any sign-in still waiting for its emailed code.
 * Audits 'platformUser.password_reset'. Role and status are left alone.
 *
 * @returns {Promise<{ tokenVersion: number }>}
 */
const resetPlatformUserPassword = async ({ userId, password, actor = SYSTEM_ACTOR, req }) => {
  const { PlatformUser, PlatformAuditLog, PlatformLoginChallenge } = getPlatformModels();

  const user = await PlatformUser.findById(userId);
  if (!user) throw new Error('Platform user not found');

  await user.setPassword(password); // validates length, sets user.passwordHash

  const updated = await PlatformUser.findOneAndUpdate(
    { _id: user._id },
    { $set: { passwordHash: user.passwordHash }, $inc: { tokenVersion: 1 } },
    { new: true }
  );
  if (!updated) throw new Error('Platform user not found');

  await PlatformLoginChallenge.deleteMany({ userId: user._id });

  await PlatformAuditLog.record({
    actor,
    action: 'platformUser.password_reset',
    targetType: 'PlatformUser',
    targetId: user._id,
    targetKey: user.email,
    req,
  });

  return { tokenVersion: updated.tokenVersion };
};

module.exports = {
  SYSTEM_ACTOR,
  normalizeEmail,
  findPlatformUserByEmail,
  createPlatformUser,
  resetPlatformUserPassword,
};
