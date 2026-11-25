/**
 * Platform (product-owner) database connection.
 *
 * One dedicated Mongoose connection, separate from the default connection and
 * from every tenant connection. It holds the tenant registry, role templates,
 * platform staff accounts and the platform audit log.
 *
 * The database name is always passed explicitly (PLATFORM_DB_NAME, default
 * 'logiforce_platform'), so PLATFORM_MONGODB_URI can be the same cluster URI
 * the tenants use without ever landing in a tenant database.
 *
 * Never log the URI: it carries credentials.
 */
const mongoose = require('mongoose');
const logger = require('../utils/logger');

const DEFAULT_PLATFORM_DB_NAME = 'logiforce_platform';

const getPlatformDbName = () => process.env.PLATFORM_DB_NAME || DEFAULT_PLATFORM_DB_NAME;

let connection = null; // set once the connection has opened
let connecting = null; // in-flight connect promise, shared by concurrent callers

const onError = (err) => logger.error('Platform DB connection error', { error: err.message });
const onDisconnected = () => logger.warn('Platform DB disconnected');
const onReconnected = () => logger.info('Platform DB reconnected');

/**
 * Open the platform connection. Idempotent: every call after the first returns
 * the same connection (Mongoose reconnects it by itself if it drops).
 */
const connectPlatformDb = async () => {
  if (connection) return connection;
  if (connecting) return connecting;

  const uri = process.env.PLATFORM_MONGODB_URI;
  if (!uri) {
    throw new Error('PLATFORM_MONGODB_URI is not set');
  }

  const dbName = getPlatformDbName();

  // Same TLS rule as the tenant connections: Atlas (mongodb+srv://) always
  // speaks TLS, a plain mongodb:// URI (local / docker mongo) must not be forced.
  const useTls = uri.startsWith('mongodb+srv://');

  connecting = (async () => {
    const conn = mongoose.createConnection(uri, {
      dbName,
      ...(useTls ? { tls: true, tlsAllowInvalidCertificates: false } : {}),
      maxPoolSize: 5,
      serverSelectionTimeoutMS: 5000,
    });

    // An initial failure surfaces through this rejection (the caller logs it).
    try {
      await conn.asPromise();
    } catch (err) {
      await conn.close().catch(() => {});
      throw err;
    }

    // Later errors are emitted as events; without a listener they would crash the process.
    conn.on('error', onError);
    conn.on('disconnected', onDisconnected);
    conn.on('reconnected', onReconnected);

    logger.info(`Platform DB connected: ${dbName}`);
    connection = conn;
    return conn;
  })();

  try {
    return await connecting;
  } finally {
    connecting = null;
  }
};

/**
 * The open platform connection. Throws if connectPlatformDb() hasn't completed.
 */
const getPlatformConnection = () => {
  if (!connection) {
    throw new Error('Platform DB is not connected. Call connectPlatformDb() first.');
  }
  return connection;
};

const closePlatformDb = async () => {
  if (connecting) {
    await connecting.catch(() => {});
  }
  if (!connection) return;
  const conn = connection;
  connection = null;
  conn.off('disconnected', onDisconnected); // a deliberate close is not worth a warning
  await conn.close();
};

module.exports = {
  connectPlatformDb,
  getPlatformConnection,
  closePlatformDb,
  getPlatformDbName,
  DEFAULT_PLATFORM_DB_NAME,
};
