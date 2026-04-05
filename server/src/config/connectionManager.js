const mongoose = require('mongoose');

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
