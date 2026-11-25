/**
 * Platform (product-owner) sign-in: password, then a 6-digit code sent by email.
 *
 *   login()     email + password → challenge token (no JWT yet), code emailed
 *   verifyOtp() challenge token + code → platform JWT
 *   resendOtp() challenge token → new code (the old one stops working)
 *
 * Only hashes are stored (see models/PlatformLoginChallenge.js). Never log a
 * code, a challenge token or a JWT.
 */
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const logger = require('../../utils/logger');
const { getPlatformModels } = require('../models');
const {
  getPlatformJwtSecret,
  getPlatformJwtExpiresIn,
  PLATFORM_JWT_AUDIENCE,
  PLATFORM_JWT_ISSUER,
  PLATFORM_JWT_ALGORITHM,
} = require('../config');
const { sendPlatformLoginCode } = require('./platformMailer');
const { normalizeEmail } = require('./platformUser.service');

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_MIN_INTERVAL_MS = 60 * 1000;
const OTP_MAX_RESENDS = 3;

// bcrypt hash, at the same cost (12) as real platform passwords, of a random
// string nobody knows. Compared against when the email doesn't exist, so an
// unknown email takes as long to reject as a wrong password.
const DUMMY_PASSWORD_HASH = '$2a$12$JtYf2C7KBnyltNIP3OOKF.JeYM/WWGjq4KO2qI4LvXWhl1JXemtQu';

class PlatformAuthError extends Error {
  constructor(status, code, message, extra = undefined) {
    super(message);
    this.name = 'PlatformAuthError';
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

const invalidCredentials = () => new PlatformAuthError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
const otpInvalid = () => new PlatformAuthError(401, 'OTP_INVALID', 'Invalid or expired code');
const otpLocked = () => new PlatformAuthError(401, 'OTP_LOCKED', 'Too many attempts, sign in again');
const emailFailed = () => new PlatformAuthError(
  502, 'EMAIL_SEND_FAILED', 'Could not send the sign-in code. Please try again later.'
);

// ── Helpers ──

const sha256 = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');

const hmacCode = (code) =>
  crypto.createHmac('sha256', getPlatformJwtSecret()).update(String(code)).digest('hex');

const generateCode = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');

const generateChallengeToken = () => crypto.randomBytes(32).toString('hex');

const codeMatches = (code, storedHash) => {
  const given = Buffer.from(hmacCode(code), 'hex');
  const stored = Buffer.from(String(storedHash || ''), 'hex');
  return stored.length === given.length && crypto.timingSafeEqual(given, stored);
};

// 'jane.doe@example.com' → 'j***@example.com'
const maskEmail = (email) => {
  const [local = '', domain = ''] = String(email).split('@');
  return domain ? `${local.slice(0, 1)}***@${domain}` : '***';
};

const requestMeta = (req) => ({
  ip: req?.ip,
  userAgent: typeof req?.get === 'function' ? req.get('user-agent') : undefined,
});

const publicUser = (user) => ({ _id: user._id, email: user.email, name: user.name, role: user.role });

const userActor = (user) => ({ userId: user._id, email: user.email });

const signPlatformToken = (user) => jwt.sign(
  { sub: String(user._id), role: user.role, tv: user.tokenVersion ?? 0 },
  getPlatformJwtSecret(),
  {
    algorithm: PLATFORM_JWT_ALGORITHM,
    audience: PLATFORM_JWT_AUDIENCE,
    issuer: PLATFORM_JWT_ISSUER,
    expiresIn: getPlatformJwtExpiresIn(),
  }
);

/** Throws (jsonwebtoken errors) unless the token is a valid platform token. */
const verifyPlatformToken = (token) => jwt.verify(token, getPlatformJwtSecret(), {
  algorithms: [PLATFORM_JWT_ALGORITHM],
  audience: PLATFORM_JWT_AUDIENCE,
  issuer: PLATFORM_JWT_ISSUER,
});

const findChallenge = (challengeToken) => {
  const { PlatformLoginChallenge } = getPlatformModels();
  return PlatformLoginChallenge.findOne({ tokenHash: sha256(challengeToken) });
};

const isOpen = (challenge, now) => Boolean(challenge) && !challenge.consumedAt && challenge.expiresAt > now;

/**
 * Delete a challenge that reached the attempt limit. Audits once, even if
 * several requests hit the limit at the same moment.
 */
const lockChallenge = async (challenge, req) => {
  const { PlatformLoginChallenge, PlatformUser, PlatformAuditLog } = getPlatformModels();
  const { deletedCount } = await PlatformLoginChallenge.deleteOne({ _id: challenge._id });
  if (deletedCount !== 1) return;

  const user = await PlatformUser.findById(challenge.userId).select('email').lean();
  await PlatformAuditLog.record({
    actor: { userId: challenge.userId, email: user?.email || 'unknown' },
    action: 'platformUser.otp_locked',
    targetType: 'PlatformUser',
    targetId: challenge.userId,
    targetKey: user?.email,
    req,
  });
  logger.warn('Platform sign-in locked after too many wrong codes', { email: user?.email, ip: req?.ip });
};

const requireString = (value) => typeof value === 'string' && value.length > 0;

// ── Steps ──

/**
 * Step 1: email + password. Issues a challenge and emails the code; never a JWT.
 */
const login = async ({ email, password, req }) => {
  if (!requireString(email) || !email.trim() || !requireString(password)) {
    throw new PlatformAuthError(400, 'VALIDATION_ERROR', 'Email and password are required');
  }

  const { PlatformUser, PlatformLoginChallenge } = getPlatformModels();
  const emailNorm = normalizeEmail(email);
  const user = await PlatformUser.findOne({ email: emailNorm }).select('+passwordHash');

  // Always one bcrypt comparison, whether or not the email exists.
  const passwordOk = await bcrypt.compare(password, user?.passwordHash || DUMMY_PASSWORD_HASH);
  if (!user || !passwordOk || user.status !== 'active') {
    logger.warn('Platform login failed', { email: emailNorm, ip: req?.ip });
    throw invalidCredentials();
  }

  await PlatformLoginChallenge.deleteMany({ userId: user._id, consumedAt: null });

  const code = generateCode();
  const challengeToken = generateChallengeToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + OTP_TTL_MS);

  const challenge = await PlatformLoginChallenge.create({
    userId: user._id,
    tokenHash: sha256(challengeToken),
    codeHash: hmacCode(code),
    expiresAt,
    lastSentAt: now,
    ...requestMeta(req),
  });

  try {
    await sendPlatformLoginCode({
      to: user.email,
      name: user.name,
      code,
      expiresAt,
      expiresMinutes: Math.round(OTP_TTL_MS / 60000),
      ip: req?.ip,
    });
  } catch (err) {
    // Don't leave a live challenge behind for a code nobody received.
    await PlatformLoginChallenge.deleteOne({ _id: challenge._id }).catch(() => {});
    logger.error('Platform sign-in code email failed', { email: user.email, error: err.message });
    throw emailFailed();
  }

  return { challengeToken, expiresAt, maskedEmail: maskEmail(user.email) };
};

/**
 * Step 2: challenge token + code → platform JWT.
 */
const verifyOtp = async ({ challengeToken, code, req }) => {
  const codeStr = typeof code === 'number' ? String(code).padStart(6, '0') : code;
  if (!requireString(challengeToken) || !requireString(codeStr)) {
    throw new PlatformAuthError(400, 'VALIDATION_ERROR', 'challengeToken and code are required');
  }
  if (!/^\d{6}$/.test(codeStr.trim())) {
    throw new PlatformAuthError(400, 'VALIDATION_ERROR', 'The code must be 6 digits');
  }

  const { PlatformLoginChallenge, PlatformUser, PlatformAuditLog } = getPlatformModels();
  const now = new Date();
  const challenge = await findChallenge(challengeToken);

  if (!isOpen(challenge, now)) throw otpInvalid();
  if (challenge.attempts >= OTP_MAX_ATTEMPTS) {
    await lockChallenge(challenge, req);
    throw otpLocked();
  }

  if (!codeMatches(codeStr.trim(), challenge.codeHash)) {
    const updated = await PlatformLoginChallenge.findOneAndUpdate(
      { _id: challenge._id, consumedAt: null },
      { $inc: { attempts: 1 } },
      { new: true }
    );
    if (updated && updated.attempts >= OTP_MAX_ATTEMPTS) {
      await lockChallenge(updated, req);
      throw otpLocked();
    }
    throw otpInvalid();
  }

  // Consume atomically: only one request can ever win this update. The code
  // hash is part of the filter so a resend that happened in between (new code)
  // makes the old code fail here.
  const consumed = await PlatformLoginChallenge.findOneAndUpdate(
    {
      _id: challenge._id,
      consumedAt: null,
      codeHash: challenge.codeHash,
      attempts: { $lt: OTP_MAX_ATTEMPTS },
      expiresAt: { $gt: now },
    },
    { $set: { consumedAt: now } },
    { new: true }
  );
  if (!consumed) throw otpInvalid(); // already used

  const user = await PlatformUser.findById(challenge.userId);
  if (!user || user.status !== 'active') throw otpInvalid();

  await PlatformUser.updateOne({ _id: user._id }, { $set: { lastLoginAt: now } });
  user.lastLoginAt = now;

  await PlatformAuditLog.record({
    actor: userActor(user),
    action: 'platformUser.login',
    targetType: 'PlatformUser',
    targetId: user._id,
    targetKey: user.email,
    req,
  });

  return { token: signPlatformToken(user), user: publicUser(user) };
};

/**
 * Send a new code for an open challenge. At least 60s between sends and at
 * most 3 resends per challenge. Resets attempts and the 10-minute expiry.
 */
const resendOtp = async ({ challengeToken, req }) => {
  if (!requireString(challengeToken)) {
    throw new PlatformAuthError(400, 'VALIDATION_ERROR', 'challengeToken is required');
  }

  const { PlatformLoginChallenge, PlatformUser } = getPlatformModels();
  const now = new Date();
  const challenge = await findChallenge(challengeToken);

  if (!isOpen(challenge, now)) throw otpInvalid();
  if (challenge.attempts >= OTP_MAX_ATTEMPTS) {
    await lockChallenge(challenge, req);
    throw otpLocked();
  }
  if (challenge.resendCount >= OTP_MAX_RESENDS) {
    throw new PlatformAuthError(429, 'OTP_RESEND_LIMIT', 'No more codes can be sent for this sign-in. Sign in again.');
  }

  const lastSentAt = challenge.lastSentAt || challenge.createdAt;
  const waitMs = lastSentAt.getTime() + OTP_RESEND_MIN_INTERVAL_MS - now.getTime();
  if (waitMs > 0) {
    const retryAfterSeconds = Math.ceil(waitMs / 1000);
    throw new PlatformAuthError(
      429, 'OTP_RESEND_TOO_SOON', `Wait ${retryAfterSeconds} seconds before requesting another code`, { retryAfterSeconds }
    );
  }

  const user = await PlatformUser.findById(challenge.userId);
  if (!user || user.status !== 'active') {
    await PlatformLoginChallenge.deleteOne({ _id: challenge._id });
    throw otpInvalid();
  }

  const code = generateCode();
  const expiresAt = new Date(now.getTime() + OTP_TTL_MS);
  const updated = await PlatformLoginChallenge.findOneAndUpdate(
    {
      _id: challenge._id,
      consumedAt: null,
      expiresAt: { $gt: now },
      attempts: { $lt: OTP_MAX_ATTEMPTS },
      resendCount: { $lt: OTP_MAX_RESENDS },
      lastSentAt: challenge.lastSentAt ?? null, // a concurrent resend changes this
    },
    {
      $set: { codeHash: hmacCode(code), attempts: 0, expiresAt, lastSentAt: now },
      $inc: { resendCount: 1 },
    },
    { new: true }
  );
  if (!updated) {
    throw new PlatformAuthError(429, 'OTP_RESEND_TOO_SOON', 'A code was just sent. Wait before requesting another.');
  }

  try {
    await sendPlatformLoginCode({
      to: user.email,
      name: user.name,
      code,
      expiresAt,
      expiresMinutes: Math.round(OTP_TTL_MS / 60000),
      ip: req?.ip,
    });
  } catch (err) {
    logger.error('Platform sign-in code email failed (resend)', { email: user.email, error: err.message });
    throw emailFailed();
  }

  return {
    expiresAt,
    maskedEmail: maskEmail(user.email),
    resendsRemaining: OTP_MAX_RESENDS - updated.resendCount,
  };
};

module.exports = {
  OTP_TTL_MS,
  OTP_MAX_ATTEMPTS,
  OTP_RESEND_MIN_INTERVAL_MS,
  OTP_MAX_RESENDS,
  PlatformAuthError,
  login,
  verifyOtp,
  resendOtp,
  signPlatformToken,
  verifyPlatformToken,
  maskEmail,
  // exported for the verify script
  sha256,
  hmacCode,
};
