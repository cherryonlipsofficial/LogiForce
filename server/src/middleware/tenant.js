const { getTenantBySubdomain, redactUris } = require('../config/tenants');
const { tenantKeyFromHostname } = require('../config/appDomain');
// Called through the module object so tests can observe it.
const connectionManager = require('../config/connectionManager');

/**
 * Tenant resolution middleware.
 *
 * Reads the tenant key from:
 *   1. the `x-tenant-id` header (sent by the frontend), else
 *   2. the subdomain of the Origin/Referer, when it is <key>.<APP_DOMAIN>
 *
 * and looks it up in the platform database (config/tenants.js, cached 60s).
 * There is no built-in list of companies: a company exists when its Tenant
 * record does, so a new one works without a restart.
 *
 * Responses before any route runs:
 *   400 no tenant key
 *   404 unknown tenant
 *   503 TENANT_PROVISIONING   still being set up
 *   403 TENANT_SUSPENDED / TENANT_ARCHIVED
 *   503 platform lookup failed · 500 tenant DB connection failed
 *
 * Sets:
 *   req.tenant       — tenant config object
 *   req.tenantKey    — the company's canonical key (tenant.key from the platform
 *                      record, lower-case), not the raw header. Tenant JWTs are
 *                      bound to it (`tid`).
 *   req.dbConnection — Mongoose connection to the tenant's database
 *
 * Every path ends in a response or next(); no rejection escapes.
 */
const STATUS_RESPONSES = Object.freeze({
  provisioning: { status: 503, code: 'TENANT_PROVISIONING', message: 'This account is still being set up. Please try again shortly.' },
  suspended: { status: 403, code: 'TENANT_SUSPENDED', message: 'Account suspended' },
  archived: { status: 403, code: 'TENANT_ARCHIVED', message: 'This account is no longer active' },
});

const tenantKeyFromRequest = (req) => {
  const header = req.headers['x-tenant-id'];
  if (header) return header;
  const origin = req.headers.origin || req.headers.referer || '';
  try {
    return tenantKeyFromHostname(new URL(origin).hostname);
  } catch {
    return null; // invalid URL
  }
};

const resolveTenant = async (req, res, next) => {
  try {
    const tenantKey = tenantKeyFromRequest(req);
    if (!tenantKey) {
      return res.status(400).json({
        success: false,
        message: 'Tenant could not be determined. Use x-tenant-id header.',
      });
    }

    let tenant;
    try {
      tenant = await getTenantBySubdomain(tenantKey);
    } catch (error) {
      console.error(`[Tenant] Lookup failed for ${String(tenantKey).slice(0, 64)}:`, redactUris(error.message));
      return res.status(503).json({ success: false, message: 'Service temporarily unavailable' });
    }

    if (!tenant) {
      return res.status(404).json({
        success: false,
        message: `Unknown tenant: ${String(tenantKey).slice(0, 64)}`,
        code: 'TENANT_NOT_FOUND',
      });
    }

    // Before opening any connection: a company that isn't active never
    // touches its database.
    if (tenant.status !== 'active') {
      const r = STATUS_RESPONSES[tenant.status] || STATUS_RESPONSES.suspended;
      return res.status(r.status).json({ success: false, message: r.message, code: r.code });
    }

    const dbConnection = await connectionManager.getConnectionForTenant(tenant);

    req.tenant = tenant;
    req.tenantKey = tenant.key;
    req.dbConnection = dbConnection;
  } catch (error) {
    console.error('[Tenant] Resolution failed:', redactUris(error.message));
    if (res.headersSent) return undefined;
    return res.status(500).json({ success: false, message: 'Tenant resolution failed' });
  }

  // Outside the try block, so an error thrown further down the chain is never
  // answered here as "Tenant resolution failed".
  return next();
};

module.exports = { resolveTenant, STATUS_RESPONSES };
