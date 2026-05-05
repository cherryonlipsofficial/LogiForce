const crypto = require('crypto');

const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000; // 1 hour

const generateResetToken = () => {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  return { token, tokenHash };
};

const hashResetToken = (token) =>
  crypto.createHash('sha256').update(String(token)).digest('hex');

/**
 * Build a tenant-aware reset URL. Prefers the request Origin/Referer so the
 * link sends the user back to the same subdomain they were on. Falls back to
 * CLIENT_URL env var, then to a sensible default.
 */
const buildResetPasswordUrl = (req, token) => {
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
  generateResetToken,
  hashResetToken,
  buildResetPasswordUrl,
};
