/**
 * Platform user accounts: create, invite, set and reset a password.
 *
 * Used by `npm run platform:create-owner`, step 3 of the platform seed,
 * scripts/migrateToPlatform.js and the public /api/platform/auth/set-password
 * routes. Every change is written to platform_audit_logs. Never logs a
 * password or a set-password token.
 */
const { getPlatformModels } = require('../models');
const { hashPlatformPassword } = require('../models/PlatformUser');
const { generateResetToken, hashResetToken } = require('../../modules/shared/passwordReset.helpers');
const platformMailer = require('./platformMailer');

const PASSWORD_SET_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

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

// ── Invitations: a user without a password gets an emailed set-password link ──

class PasswordSetError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'PasswordSetError';
    this.status = status;
    this.code = code;
  }
}

/**
 * Base URL of the platform console, from PLATFORM_CONSOLE_URL. The emailed
 * link is `${base}/set-password/<token>`; the console page there calls
 * GET and POST /api/platform/auth/set-password.
 */
const getPlatformConsoleUrl = () => (process.env.PLATFORM_CONSOLE_URL || '').trim().replace(/\/+$/, '');

const buildPlatformSetPasswordUrl = (token) => {
  const base = getPlatformConsoleUrl();
  if (!/^https?:\/\/[^\s]+$/i.test(base)) {
    throw new Error('PLATFORM_CONSOLE_URL is not set (or not an http(s) URL). Set it to the platform console\'s '
      + 'address, e.g. https://platform.logiforce.app, so the set-password link has somewhere to go.');
  }
  return `${base}/set-password/${token}`;
};

/**
 * Create a platform user with no password and audit 'platformUser.create'.
 * They can't sign in until they use a link from sendPlatformSetPasswordLink().
 */
const createInvitedPlatformUser = async ({
  email, name, role = 'owner', actor = SYSTEM_ACTOR, req,
}) => {
  const { PlatformUser, PlatformAuditLog } = getPlatformModels();
  const user = await PlatformUser.create({ email, name, role, status: 'active', passwordHash: null });
  await PlatformAuditLog.record({
    actor,
    action: 'platformUser.create',
    targetType: 'PlatformUser',
    targetId: user._id,
    targetKey: user.email,
    before: null,
    after: { ...user.toJSON(), invited: true },
    req,
  });
  return user;
};

/**
 * Issue a one-time set-password token (24h), store its hash and email the link.
 * A new link replaces any earlier one. If the email fails the token is removed
 * again and this throws. Audits 'platformUser.set_password_link_sent'.
 *
 * @returns {Promise<{ email: string, expiresAt: Date }>}
 */
const sendPlatformSetPasswordLink = async ({ userId, actor = SYSTEM_ACTOR, req }) => {
  const { PlatformUser, PlatformAuditLog } = getPlatformModels();
  const user = await PlatformUser.findById(userId);
  if (!user) throw new Error('Platform user not found');
  if (user.status !== 'active') throw new Error(`Platform user ${user.email} is ${user.status}`);

  const { token, tokenHash } = generateResetToken();
  const url = buildPlatformSetPasswordUrl(token); // before storing anything
  const expiresAt = new Date(Date.now() + PASSWORD_SET_TTL_MS);
  await PlatformUser.updateOne(
    { _id: user._id },
    { $set: { passwordSetTokenHash: tokenHash, passwordSetExpires: expiresAt } }
  );

  try {
    await platformMailer.sendPlatformSetPasswordEmail({ to: user.email, name: user.name, url, expiresAt });
  } catch (err) {
    await PlatformUser.updateOne(
      { _id: user._id, passwordSetTokenHash: tokenHash },
      { $set: { passwordSetTokenHash: null, passwordSetExpires: null } }
    ).catch(() => {});
    throw new Error(`Could not send the set-password email to ${user.email}: ${err.message}`);
  }

  await PlatformAuditLog.record({
    actor,
    action: 'platformUser.set_password_link_sent',
    targetType: 'PlatformUser',
    targetId: user._id,
    targetKey: user.email,
    after: { expiresAt },
    req,
  });
  return { email: user.email, expiresAt };
};

const invalidLink = () => new PasswordSetError(400, 'SET_PASSWORD_LINK_INVALID', 'This link is invalid or has expired');

const isTokenShaped = (token) => typeof token === 'string' && /^[a-f0-9]{64}$/i.test(token);

/** Who a set-password token belongs to, for the console page. Throws if it isn't usable. */
const checkPlatformSetPasswordToken = async (token) => {
  if (!isTokenShaped(token)) throw invalidLink();
  const { PlatformUser } = getPlatformModels();
  const user = await PlatformUser.findOne({
    passwordSetTokenHash: hashResetToken(token),
    passwordSetExpires: { $gt: new Date() },
    status: 'active',
  }).select('email name passwordSetExpires').lean();
  if (!user) throw invalidLink();
  return { email: user.email, name: user.name, expiresAt: user.passwordSetExpires };
};

/**
 * Use a set-password token: sets the password, uses up the token, increments
 * tokenVersion (signs out any existing session) and drops pending sign-in
 * challenges. Audits 'platformUser.password_set'.
 */
const setPlatformPasswordWithToken = async ({ token, password, req }) => {
  if (!isTokenShaped(token)) throw invalidLink();
  const { PlatformUser, PlatformAuditLog, PlatformLoginChallenge } = getPlatformModels();

  let passwordHash;
  try {
    passwordHash = await hashPlatformPassword(password); // length check, bcrypt hash
  } catch (err) {
    throw new PasswordSetError(400, 'VALIDATION_ERROR', err.message);
  }

  const now = new Date();
  // One atomic update, so a token can only ever be used once.
  const user = await PlatformUser.findOneAndUpdate(
    { passwordSetTokenHash: hashResetToken(token), passwordSetExpires: { $gt: now }, status: 'active' },
    {
      $set: { passwordHash, passwordSetTokenHash: null, passwordSetExpires: null },
      $inc: { tokenVersion: 1 },
    },
    { new: true }
  );
  if (!user) throw invalidLink();

  await PlatformLoginChallenge.deleteMany({ userId: user._id });
  await PlatformAuditLog.record({
    actor: { userId: user._id, email: user.email },
    action: 'platformUser.password_set',
    targetType: 'PlatformUser',
    targetId: user._id,
    targetKey: user.email,
    req,
  });
  return { email: user.email };
};

module.exports = {
  SYSTEM_ACTOR,
  PASSWORD_SET_TTL_MS,
  PasswordSetError,
  normalizeEmail,
  findPlatformUserByEmail,
  createPlatformUser,
  resetPlatformUserPassword,
  getPlatformConsoleUrl,
  buildPlatformSetPasswordUrl,
  createInvitedPlatformUser,
  sendPlatformSetPasswordLink,
  checkPlatformSetPasswordToken,
  setPlatformPasswordWithToken,
};
