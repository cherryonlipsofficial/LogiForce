/**
 * Tenant (company) lookup.
 *
 * Companies live in the platform database, collection 'tenants'
 * (platform/models/Tenant.js). This module reads them, turns each record into
 * the tenantConfig shape the rest of the app uses, and caches the result in
 * memory. It never writes to the platform database.
 *
 * tenantConfig:
 *   { key, name, dbName, dbUri, status, enabledModules, roleTemplateKeys,
 *     limits, allowSelfSignup, tenantId }
 * `dbUri` is a non-enumerable property, so logging or JSON-serialising a
 * tenantConfig (e.g. req.tenant) never prints a connection string.
 *
 * Never log a URI: it carries credentials.
 */
const logger = require('../utils/logger');
const { getPlatformModels } = require('../platform/models');
const { TENANT_KEY_PATTERN } = require('../platform/models/Tenant');

// MONGODB_BASE_URI, e.g. "mongodb+srv://user:pass@cluster0.xxxxx.mongodb.net",
// is read on every call so tests and scripts can set it late.

const DEFAULT_CACHE_TTL_MS = 60000; // found records; override with TENANT_CACHE_TTL_MS
const NOT_FOUND_TTL_MS = 10000;     // unknown keys, so a new company shows up quickly
const STALE_RETRY_MS = 10000;       // after serving a stale record, wait this long before querying again
const STALE_WARN_INTERVAL_MS = 60000;
const MAX_NOT_FOUND_ENTRIES = 1000; // past this, expired "not found" entries are swept

const isMongoUri = (uri) => uri.startsWith('mongodb://') || uri.startsWith('mongodb+srv://');

/**
 * URI for a company database on the shared cluster: MONGODB_BASE_URI/<dbName>.
 * Returns null when MONGODB_BASE_URI is missing or not a MongoDB URI.
 * Every company lives on that one cluster; there are no per-company env vars.
 */
const buildDbUri = (dbName) => {
  const base = (process.env.MONGODB_BASE_URI || '').trim();
  if (!base) return null;
  if (!isMongoUri(base)) {
    console.error('[CONFIG] MONGODB_BASE_URI must start with "mongodb://" or "mongodb+srv://"');
    return null;
  }
  // Keep any query string (e.g. ?retryWrites=true) after the database name.
  const [hostPart, query] = base.split('?');
  return `${hostPart.replace(/\/+$/, '')}/${dbName}${query ? `?${query}` : ''}`;
};

/** Replace anything that looks like a MongoDB connection string. For log lines. */
const redactUris = (text) => String(text ?? '').replace(/mongodb(?:\+srv)?:\/\/\S+/gi, 'mongodb://<redacted>');

const cacheTtlMs = () => {
  const raw = process.env.TENANT_CACHE_TTL_MS;
  if (raw === undefined || raw === '') return DEFAULT_CACHE_TTL_MS;
  const ms = Number(raw);
  return Number.isFinite(ms) && ms >= 0 ? ms : DEFAULT_CACHE_TTL_MS;
};

/** Lower-cased, trimmed key, or null if it can't be a tenant key. */
const normaliseTenantKey = (subdomain) => {
  const key = String(subdomain || '').trim().toLowerCase();
  return TENANT_KEY_PATTERN.test(key) ? key : null;
};

const resolveDbUri = (record) => {
  const uri = buildDbUri(record.dbName);
  if (!uri) throw new Error(`Tenant ${record.key}: no MongoDB URI (MONGODB_BASE_URI is not set or not valid)`);
  return uri;
};

/**
 * Platform Tenant record (lean) → tenantConfig. Throws if the URI can't be built.
 * The result is frozen: it is shared by every request that hits the cache.
 */
const mapTenantRecord = (record) => {
  const config = {
    key: record.key,
    name: record.name,
    dbName: record.dbName,
    status: record.status,
    enabledModules: Object.freeze([...(record.enabledModules || [])]),
    roleTemplateKeys: Object.freeze([...(record.roleTemplateKeys || [])]),
    limits: Object.freeze({ maxUsers: null, ...(record.limits || {}) }),
    allowSelfSignup: record.allowSelfSignup === true,
    tenantId: String(record._id),
  };
  Object.defineProperty(config, 'dbUri', { value: resolveDbUri(record), enumerable: false });
  return Object.freeze(config);
};

// ── Cache ──
// key → { loaded, value (tenantConfig | null), expiresAt, pending (Promise | null) }
const cache = new Map();
const lastStaleWarnAt = new Map();

const sweepNotFoundEntries = () => {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (entry.loaded && entry.value === null && !entry.pending && entry.expiresAt <= now) cache.delete(key);
  }
};

const warnStale = (key, err) => {
  const now = Date.now();
  if (now - (lastStaleWarnAt.get(key) || 0) < STALE_WARN_INTERVAL_MS) return;
  lastStaleWarnAt.set(key, now);
  logger.warn(`[Tenants] Platform DB lookup for ${key} failed, serving the cached record: ${redactUris(err?.message)}`);
};

const findTenantRecord = async (key) => {
  const { Tenant } = getPlatformModels(); // throws if the platform DB was never connected
  // Fail fast while disconnected instead of waiting for Mongoose's command buffer to time out.
  if (Tenant.db.readyState !== 1) throw new Error('Platform DB is not connected');
  return Tenant.findOne({ key }).lean();
};

const dropEntry = (key, entry) => {
  if (cache.get(key) === entry) cache.delete(key);
};

const loadTenant = async (key, entry) => {
  let record;
  try {
    record = await findTenantRecord(key);
  } catch (err) {
    if (entry.loaded && entry.value) {
      warnStale(key, err);
      entry.expiresAt = Date.now() + STALE_RETRY_MS;
      return entry.value;
    }
    dropEntry(key, entry);
    throw err;
  }

  let value;
  try {
    value = record ? mapTenantRecord(record) : null;
  } catch (err) {
    dropEntry(key, entry);
    throw err;
  }

  // Skip the write if invalidateTenantCache() ran while this query was in flight.
  if (cache.get(key) === entry) {
    entry.loaded = true;
    entry.value = value;
    entry.expiresAt = Date.now() + (value ? cacheTtlMs() : NOT_FOUND_TTL_MS);
    if (!value && cache.size > MAX_NOT_FOUND_ENTRIES) sweepNotFoundEntries();
  }
  return value;
};

/**
 * @param {string} subdomain  tenant key, e.g. from the x-tenant-id header
 * @returns {Promise<object|null>} tenantConfig, or null if there is no such company.
 *   Rejects if the platform DB can't be queried and nothing is cached for the key,
 *   or if the company's database URI can't be built.
 */
const getTenantBySubdomain = async (subdomain) => {
  const key = normaliseTenantKey(subdomain);
  if (!key) return null;

  let entry = cache.get(key);
  if (entry && entry.loaded && entry.expiresAt > Date.now()) return entry.value;
  if (entry && entry.pending) return entry.pending; // share the in-flight query

  if (!entry) {
    entry = { loaded: false, value: null, expiresAt: 0, pending: null };
    cache.set(key, entry);
  }
  const current = entry;
  current.pending = loadTenant(key, current).finally(() => {
    current.pending = null;
  });
  return current.pending;
};

/**
 * Forget one cached company (by key), or every company when no key is given.
 * The next lookup queries the platform DB again.
 */
const invalidateTenantCache = (key) => {
  if (key === undefined || key === null) {
    cache.clear();
    lastStaleWarnAt.clear();
    return;
  }
  const normalised = String(key).trim().toLowerCase();
  cache.delete(normalised);
  lastStaleWarnAt.delete(normalised);
};

/**
 * Every company with status 'active', mapped to tenantConfig. Not cached.
 * A record whose URI can't be built is logged and left out.
 */
const listActiveTenants = async () => {
  const { Tenant } = getPlatformModels();
  const records = await Tenant.find({ status: 'active' }).sort({ key: 1 }).lean();
  const tenants = [];
  for (const record of records) {
    try {
      tenants.push(mapTenantRecord(record));
    } catch (err) {
      logger.error(`[Tenants] Skipping tenant ${record.key}: ${redactUris(err.message)}`);
    }
  }
  return tenants;
};

module.exports = {
  getTenantBySubdomain,
  invalidateTenantCache,
  listActiveTenants,
  buildDbUri,
  mapTenantRecord,
  normaliseTenantKey,
  redactUris,
};
