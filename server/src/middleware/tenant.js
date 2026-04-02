const { getTenantBySubdomain } = require('../config/tenants');
const { getConnectionForTenant } = require('../config/connectionManager');

/**
 * Tenant resolution middleware.
 *
 * Reads the tenant from:
 *   1. `x-tenant-id` header (for API calls from frontend)
 *   2. Origin/Referer hostname subdomain (fallback)
 *
 * Sets:
 *   req.tenant     — tenant config object
 *   req.dbConnection — Mongoose connection to tenant's database
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

    const tenant = getTenantBySubdomain(tenantKey);
    if (!tenant) {
      return res.status(404).json({
        success: false,
        message: `Unknown tenant: ${tenantKey}`,
      });
    }

    // Get (or create) the DB connection for this tenant
    const dbConnection = await getConnectionForTenant(tenant);

    req.tenant = tenant;
    req.tenantKey = tenantKey;
    req.dbConnection = dbConnection;

    next();
  } catch (error) {
    console.error('[Tenant] Resolution failed:', error.message);
    res.status(500).json({ success: false, message: 'Tenant resolution failed' });
  }
};

module.exports = { resolveTenant };
