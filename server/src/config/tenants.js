/**
 * Tenant registry.
 * Each tenant maps to its own MongoDB database.
 * All databases live on the same Atlas cluster (for now).
 *
 * MIGRATION LATER: To move a tenant to its own cluster,
 * just change its `dbUri` to a different connection string.
 */

const ATLAS_BASE_URI = process.env.MONGODB_BASE_URI;
// e.g. "mongodb+srv://user:pass@cluster0.xxxxx.mongodb.net"

const tenants = {
  clienta: {
    name: 'Client A Transport LLC',
    dbName: 'logiforce_clienta',
    // For now, all share the same cluster. Later, override per-tenant:
    dbUri: process.env.MONGODB_URI_CLIENTA || `${ATLAS_BASE_URI}/logiforce_clienta`,
  },
  clientb: {
    name: 'Client B Logistics',
    dbName: 'logiforce_clientb',
    dbUri: process.env.MONGODB_URI_CLIENTB || `${ATLAS_BASE_URI}/logiforce_clientb`,
  },
  clientc: {
    name: 'Client C Freight Co',
    dbName: 'logiforce_clientc',
    dbUri: process.env.MONGODB_URI_CLIENTC || `${ATLAS_BASE_URI}/logiforce_clientc`,
  },
};

const getTenantBySubdomain = (subdomain) => {
  const key = subdomain?.toLowerCase();
  return tenants[key] || null;
};

const getAllTenantKeys = () => Object.keys(tenants);

module.exports = { tenants, getTenantBySubdomain, getAllTenantKeys };
