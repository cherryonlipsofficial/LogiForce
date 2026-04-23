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

if (!ATLAS_BASE_URI && !(process.env.MONGODB_URI_CLIENTA && process.env.MONGODB_URI_CLIENTB && process.env.MONGODB_URI_CLIENTC)) {
  console.error('[FATAL] MONGODB_BASE_URI is not set and not all tenant-specific MONGODB_URI_* env vars are provided. '
    + 'Set MONGODB_BASE_URI or provide MONGODB_URI_CLIENTA, MONGODB_URI_CLIENTB, and MONGODB_URI_CLIENTC.');
}

const buildDbUri = (tenantEnvVar, dbName) => {
  const uri = process.env[tenantEnvVar] || (ATLAS_BASE_URI ? `${ATLAS_BASE_URI}/${dbName}` : null);
  if (uri && !uri.startsWith('mongodb://') && !uri.startsWith('mongodb+srv://')) {
    console.error(`[CONFIG] Invalid MongoDB URI for ${dbName}: URI must start with "mongodb://" or "mongodb+srv://"`);
    return null;
  }
  return uri;
};

const tenants = {
  'logi-force': {
    name: 'LogiForce',
    dbName: 'logiforce_main',
    dbUri: buildDbUri('MONGODB_URI_MAIN', 'logiforce_main') || process.env.MONGODB_URI,
  },
  clienta: {
    name: 'Client A Transport LLC',
    dbName: 'logiforce_clienta',
    dbUri: buildDbUri('MONGODB_URI_CLIENTA', 'logiforce_clienta'),
  },
  clientb: {
    name: 'Client B Logistics',
    dbName: 'logiforce_clientb',
    dbUri: buildDbUri('MONGODB_URI_CLIENTB', 'logiforce_clientb'),
  },
  clientc: {
    name: 'Client C Freight Co',
    dbName: 'logiforce_clientc',
    dbUri: buildDbUri('MONGODB_URI_CLIENTC', 'logiforce_clientc'),
  },
};

const getTenantBySubdomain = (subdomain) => {
  const key = subdomain?.toLowerCase();
  return tenants[key] || null;
};

const getAllTenantKeys = () => Object.keys(tenants);

module.exports = { tenants, getTenantBySubdomain, getAllTenantKeys };
