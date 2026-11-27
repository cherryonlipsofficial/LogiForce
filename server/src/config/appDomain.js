/**
 * The one domain every company is served under: https://<tenant key>.<APP_DOMAIN>.
 * One backend and one frontend serve every company through a wildcard
 * subdomain; nothing here knows any company by name.
 *
 *   APP_DOMAIN=logiforce.app  →  https://acme.logiforce.app   (company "acme")
 *                                https://admin.logiforce.app  (platform console)
 *
 * Read on every call so tests and scripts can set it late.
 */

/** Lower-cased APP_DOMAIN without scheme, slashes or a leading dot; '' when unset. */
const getAppDomain = () => String(process.env.APP_DOMAIN || '')
  .trim()
  .toLowerCase()
  .replace(/^https?:\/\//, '')
  .replace(/^\.+/, '')
  .replace(/\/+$/, '');

const requireAppDomain = () => {
  const domain = getAppDomain();
  if (!domain) {
    throw new Error('APP_DOMAIN is not set. Set it to the domain companies are served under '
      + '(e.g. logiforce.app, so company "acme" is https://acme.logiforce.app).');
  }
  return domain;
};

/** https://<key>.<APP_DOMAIN> — where a company's users sign in. Throws without APP_DOMAIN. */
const tenantAppUrl = (key) => `https://${key}.${requireAppDomain()}`;

/**
 * The tenant key in a hostname under APP_DOMAIN ('acme.logiforce.app' → 'acme'),
 * or null when the hostname is not exactly one label under it.
 */
const tenantKeyFromHostname = (hostname) => {
  const domain = getAppDomain();
  const host = String(hostname || '').toLowerCase().replace(/:\d+$/, '');
  if (!domain || !host.endsWith(`.${domain}`)) return null;
  const sub = host.slice(0, -(domain.length + 1));
  return sub && !sub.includes('.') ? sub : null;
};

/** Escape a string for use inside a RegExp. */
const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * CORS: an origin is allowed when it is https://<anything>.<APP_DOMAIN> (or the
 * bare domain), localhost on any port, or listed in CLIENT_URL (comma-separated).
 */
const isAllowedOrigin = (origin) => {
  if (!origin) return true; // server-to-server, curl
  const domain = getAppDomain();
  if (domain && new RegExp(`^https://([a-z0-9-]+\\.)?${escapeRegExp(domain)}$`, 'i').test(origin)) return true;
  if (/^https?:\/\/localhost(:\d+)?$/i.test(origin) || /^https?:\/\/[a-z0-9-]+\.localhost(:\d+)?$/i.test(origin)) return true;
  const extra = String(process.env.CLIENT_URL || '').split(',').map((o) => o.trim()).filter(Boolean);
  return extra.includes(origin);
};

module.exports = { getAppDomain, requireAppDomain, tenantAppUrl, tenantKeyFromHostname, isAllowedOrigin };
