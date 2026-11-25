/**
 * The company list that was hardcoded in config/tenants.js before companies
 * moved to the platform database. Runtime code must not use it.
 *
 * Kept only for platform scripts: seedPlatform.js registers these companies,
 * and verifyPlatform.js / checkTenants.js compare their platform records with
 * the URIs this list resolves to.
 *
 * `dbUri` is resolved exactly as the old runtime map resolved it. Note that
 * `dbName` here is only a label: the database actually used is the one named
 * in the URI (e.g. logi-force's MONGODB_URI points at "logiforce").
 */
const { buildDbUri } = require('../../config/tenants');

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

module.exports = { tenants };
