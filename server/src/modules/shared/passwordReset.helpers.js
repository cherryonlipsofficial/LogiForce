const crypto = require('crypto');

const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000; // 1 hour
const EMAIL_OTP_TTL_MS = 10 * 60 * 1000;       // 10 minutes
const EMAIL_OTP_MAX_ATTEMPTS = 5;

const generateResetToken = () => {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  return { token, tokenHash };
};

const hashResetToken = (token) =>
  crypto.createHash('sha256').update(String(token)).digest('hex');

/**
 * 6-digit numeric OTP. randomInt is uniform — no modulo bias.
 */
const generateEmailOtp = () => {
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  const codeHash = crypto.createHash('sha256').update(code).digest('hex');
  return { code, codeHash };
};

const hashEmailOtp = (code) =>
  crypto.createHash('sha256').update(String(code)).digest('hex');

/**
 * Build a tenant-aware reset URL. Prefers the request Origin/Referer so the
 * link sends the user back to the same subdomain they were on. Falls back to
 * CLIENT_URL env var, then to a sensible default.
 *
 * `baseUrl` (optional) replaces all of that, e.g. 'https://acme.logiforce.app'
 * when the platform console sends the link: its request comes from the console,
 * not from the company's subdomain. Without it the behaviour is unchanged.
 */
const buildResetPasswordUrl = (req, token, baseUrl) => {
  if (baseUrl) return `${String(baseUrl).replace(/\/$/, '')}/reset-password/${token}`;

  const fromHeader = req.headers.origin || (() => {
    const ref = req.headers.referer;
    if (!ref) return null;
    try { return new URL(ref).origin; } catch { return null; }
  })();

  const fromEnv = (process.env.CLIENT_URL || '').split(',').map(s => s.trim()).filter(Boolean)[0];
  const base = fromHeader || fromEnv || 'https://logi-force.vercel.app';

  return `${base.replace(/\/$/, '')}/reset-password/${token}`;
};

module.exports = {
  PASSWORD_RESET_TTL_MS,
  EMAIL_OTP_TTL_MS,
  EMAIL_OTP_MAX_ATTEMPTS,
  generateResetToken,
  hashResetToken,
  generateEmailOtp,
  hashEmailOtp,
  buildResetPasswordUrl,
};
