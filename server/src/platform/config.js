/**
 * Platform (product-owner) auth settings.
 *
 * Platform tokens are signed with their own secret, PLATFORM_JWT_SECRET, never
 * with the tenant JWT_SECRET, so a token from one side can never pass the
 * other side's check. Never log either secret.
 */
const jwt = require('jsonwebtoken');

const PLATFORM_JWT_AUDIENCE = 'platform';
const PLATFORM_JWT_ISSUER = 'logiforce-platform';
const PLATFORM_JWT_ALGORITHM = 'HS256';
const DEFAULT_PLATFORM_JWT_EXPIRES_IN = '8h';
const MIN_PLATFORM_JWT_SECRET_LENGTH = 32;

/**
 * Why the platform auth env is unusable, or null when it is fine.
 * The message never includes a secret's value.
 */
const platformAuthEnvProblem = () => {
  const secret = process.env.PLATFORM_JWT_SECRET;
  const howTo = `Set it to a random string of at least ${MIN_PLATFORM_JWT_SECRET_LENGTH} characters `
    + '(for example the output of `openssl rand -hex 32`), different from JWT_SECRET.';

  if (!secret) {
    return `PLATFORM_JWT_SECRET is not set. ${howTo}`;
  }
  if (secret.length < MIN_PLATFORM_JWT_SECRET_LENGTH) {
    return `PLATFORM_JWT_SECRET is too short (${secret.length} characters). ${howTo}`;
  }
  if (secret === process.env.JWT_SECRET) {
    return 'PLATFORM_JWT_SECRET must not be the same as JWT_SECRET: tenant and platform tokens must be '
      + `signed with different secrets. ${howTo}`;
  }

  const expiresIn = getPlatformJwtExpiresIn();
  try {
    jwt.sign({}, secret, { algorithm: PLATFORM_JWT_ALGORITHM, expiresIn });
  } catch {
    return `PLATFORM_JWT_EXPIRES_IN "${expiresIn}" is not a valid duration (examples: 8h, 30m, 3600).`;
  }
  return null;
};

/**
 * Throws if the platform auth env is unusable. server.js calls this before
 * anything else starts, and exits(1) on failure.
 */
const assertPlatformAuthEnv = () => {
  const problem = platformAuthEnvProblem();
  if (problem) throw new Error(problem);
};

const getPlatformJwtSecret = () => {
  assertPlatformAuthEnv();
  return process.env.PLATFORM_JWT_SECRET;
};

function getPlatformJwtExpiresIn() {
  const raw = (process.env.PLATFORM_JWT_EXPIRES_IN || '').trim();
  if (!raw) return DEFAULT_PLATFORM_JWT_EXPIRES_IN;
  // A bare number means seconds, as in jsonwebtoken itself.
  return /^\d+$/.test(raw) ? Number(raw) : raw;
}

module.exports = {
  PLATFORM_JWT_AUDIENCE,
  PLATFORM_JWT_ISSUER,
  PLATFORM_JWT_ALGORITHM,
  DEFAULT_PLATFORM_JWT_EXPIRES_IN,
  MIN_PLATFORM_JWT_SECRET_LENGTH,
  platformAuthEnvProblem,
  assertPlatformAuthEnv,
  getPlatformJwtSecret,
  getPlatformJwtExpiresIn,
};
