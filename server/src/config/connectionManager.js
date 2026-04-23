const mongoose = require('mongoose');
const { schemas } = require('./modelRegistry');

// Old sparse unique indexes on drivers allowed only one document with a null
// value, so every new driver saved without the field collided with the
// previous one. Replace them with partial indexes that skip null/empty.
const DRIVER_LEGACY_UNIQUE_INDEXES = ['phoneUae_1', 'emiratesId_1', 'passportNumber_1'];
const DRIVER_UNIQUE_FIELDS = ['phoneUae', 'emiratesId', 'passportNumber'];

const migrateDriverUniqueIndexes = async (conn) => {
  const collection = conn.collection('drivers');

  // Skip quickly if the collection does not exist on this tenant DB yet.
  const collections = await conn.db.listCollections({ name: 'drivers' }).toArray();
  if (collections.length === 0) return;

  // Drop the old sparse unique indexes so Mongoose can recreate them as
  // partial indexes. Missing indexes are fine — treat as already migrated.
  for (const indexName of DRIVER_LEGACY_UNIQUE_INDEXES) {
    try {
      await collection.dropIndex(indexName);
    } catch (err) {
      if (err.codeName !== 'IndexNotFound' && err.code !== 27) throw err;
    }
  }

  // Unset null/empty values on existing drivers so the new partial index can
  // be built without E11000 collisions.
  for (const field of DRIVER_UNIQUE_FIELDS) {
    await collection.updateMany(
      { $or: [{ [field]: null }, { [field]: '' }] },
      { $unset: { [field]: '' } }
    );
  }

  await conn.models.Driver.syncIndexes();
};

/**
 * Maintains a pool of Mongoose connections — one per tenant.
 * Connections are created lazily on first request and cached.
 *
 * WHY: mongoose.connect() gives you ONE default connection.
 * For multi-tenant, we use mongoose.createConnection() which
 * returns independent connections, each pointed at a different DB.
 */

const connections = new Map();

const getConnectionForTenant = async (tenantConfig) => {
  const { dbName, dbUri } = tenantConfig;

  if (!dbUri) {
    throw new Error(`No valid MongoDB URI configured for tenant "${dbName}". Check MONGODB_BASE_URI or tenant-specific env vars.`);
  }

  if (connections.has(dbName)) {
    const conn = connections.get(dbName);
    // Check if connection is still alive
    if (conn.readyState === 1) return conn;
    // If disconnected, remove and recreate
    connections.delete(dbName);
  }

  const conn = await mongoose.createConnection(dbUri, {
    tls: true,
    tlsAllowInvalidCertificates: false,
    maxPoolSize: 5,          // low for free tier, increase later
    serverSelectionTimeoutMS: 5000,
  }).asPromise();

  // Register all schemas upfront so populate() and ref lookups work
  for (const [modelName, schema] of Object.entries(schemas)) {
    if (!conn.models[modelName]) {
      conn.model(modelName, schema);
    }
  }

  try {
    await migrateDriverUniqueIndexes(conn);
  } catch (err) {
    console.error(`[DB] Driver index migration failed for ${dbName}:`, err.message);
  }

  console.log(`[DB] Connected to tenant database: ${dbName}`);
  connections.set(dbName, conn);
  return conn;
};

const closeAllConnections = async () => {
  for (const [name, conn] of connections) {
    await conn.close();
    console.log(`[DB] Closed connection: ${name}`);
  }
  connections.clear();
};

module.exports = { getConnectionForTenant, closeAllConnections };
