// One frontend serves every company through a wildcard subdomain:
//   https://<company key>.<VITE_APP_DOMAIN>   a company's app
//   https://admin.<VITE_APP_DOMAIN>           the platform console
// No company is built in. On localhost (or any other host) set VITE_DEV_TENANT
// to the company key to work against.

export const APP_DOMAIN = String(import.meta.env.VITE_APP_DOMAIN || '')
  .trim()
  .toLowerCase()
  .replace(/^https?:\/\//, '')
  .replace(/^\.+/, '')
  .replace(/\/+$/, '');

export const PLATFORM_SUBDOMAIN = 'admin';

/** 'acme.logiforce.app' → 'acme' when APP_DOMAIN is 'logiforce.app'; otherwise null. */
export const subdomainOf = (hostname = window.location.hostname) => {
  const host = String(hostname || '').toLowerCase();
  if (!APP_DOMAIN || !host.endsWith(`.${APP_DOMAIN}`)) return null;
  const sub = host.slice(0, -(APP_DOMAIN.length + 1));
  return sub && !sub.includes('.') ? sub : null;
};

/**
 * The company this page belongs to: the subdomain under APP_DOMAIN, else
 * VITE_DEV_TENANT (local development), else null. Never a built-in default.
 */
export const currentTenantKey = (hostname = window.location.hostname) => {
  const sub = subdomainOf(hostname);
  if (sub && sub !== PLATFORM_SUBDOMAIN) return sub;
  const dev = String(import.meta.env.VITE_DEV_TENANT || '').trim().toLowerCase();
  return dev || null;
};

/** https://<key>.<APP_DOMAIN>, or null when APP_DOMAIN isn't set. */
export const tenantUrl = (key) => (APP_DOMAIN ? `https://${key}.${APP_DOMAIN}` : null);
