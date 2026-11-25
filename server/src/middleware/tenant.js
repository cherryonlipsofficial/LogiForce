const { getTenantBySubdomain, redactUris } = require('../config/tenants');
// Called through the module object so platform:verify can observe it.
const connectionManager = require('../config/connectionManager');

/**
 * Tenant resolution middleware.
 *
 * Reads the tenant from:
 *   1. `x-tenant-id` header (for API calls from frontend)
 *   2. Origin/Referer hostname subdomain (fallback)
 *
 * and looks it up in the platform database (config/tenants.js, cached).
 *
 * Responses before any route runs:
 *   400 no tenant key · 404 unknown tenant · 403 TENANT_SUSPENDED (status is not
 *   'active') · 503 platform lookup failed · 500 tenant DB connection failed
 *
 * Sets:
 *   req.tenant     — tenant config object
 *   req.dbConnection — Mongoose connection to tenant's database
 *
 * Every path ends in a response or next(); no rejection escapes.
 */
const resolveTenant = async (req, res, next) => {
  try {
    // 1. Try explicit header first (frontend will send this)
    let tenantKey = req.headers['x-tenant-id'];

    // 2. Fallback: extract from Origin or Referer
    if (!tenantKey) {
      const origin = req.headers.origin || req.headers.referer || '';
      try {
        const hostname = new URL(origin).hostname; // e.g. "clienta.logiforce.app"
        const parts = hostname.split('.');
        if (parts.length >= 3) {
          tenantKey = parts[0]; // "clienta"
        }
      } catch {
        // invalid URL, skip
      }
    }

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
        message: `Unknown tenant: ${tenantKey}`,
      });
    }

    // Before opening any connection: a suspended (or still provisioning)
    // company never touches its database.
    if (tenant.status !== 'active') {
      return res.status(403).json({
        success: false,
        message: 'Account suspended',
        code: 'TENANT_SUSPENDED',
      });
    }

    // Get (or create) the DB connection for this tenant
    const dbConnection = await connectionManager.getConnectionForTenant(tenant);

    req.tenant = tenant;
    req.tenantKey = tenantKey;
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

module.exports = { resolveTenant };
