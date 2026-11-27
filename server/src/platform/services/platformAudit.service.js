/**
 * Platform console: read the platform audit log.  GET /api/platform/audit-logs
 */
const platformModels = require('../models');
const { TARGET_TYPES } = require('../models/PlatformAuditLog');
const { badRequest } = require('../errors');

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const toInt = (value, fallback) => {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

const toDate = (value, field, errors, endOfDay = false) => {
  if (value === undefined || value === '') return null;
  // A bare date (YYYY-MM-DD) means the whole day.
  const bareDate = /^\d{4}-\d{2}-\d{2}$/.test(String(value));
  const d = new Date(bareDate && endOfDay ? `${value}T23:59:59.999Z` : value);
  if (Number.isNaN(d.getTime())) {
    errors[field] = `${field} is not a valid date`;
    return null;
  }
  return d;
};

/**
 * Build the Mongo filter from query-string filters.
 *   action      exact, e.g. 'tenant.suspend'
 *   targetType  'Tenant' | 'RoleTemplate' | 'PlatformUser'
 *   targetKey   tenant key, role key or email (contains, case-insensitive)
 *   tenantKey   exact company key: every entry about that company
 *   actor       actor email (contains, case-insensitive)
 *   from, to    createdAt range (ISO date or YYYY-MM-DD, inclusive)
 */
const buildFilter = (query = {}) => {
  const errors = {};
  const filter = {};
  if (query.action) filter.action = String(query.action);
  if (query.targetType) {
    if (!TARGET_TYPES.includes(query.targetType)) errors.targetType = `targetType must be one of ${TARGET_TYPES.join(', ')}`;
    else filter.targetType = query.targetType;
  }
  if (query.targetKey) filter.targetKey = { $regex: escapeRegex(String(query.targetKey).trim()), $options: 'i' };
  if (query.tenantKey) filter.tenantKey = String(query.tenantKey).trim().toLowerCase();
  if (query.actor) filter['actor.email'] = { $regex: escapeRegex(String(query.actor).trim()), $options: 'i' };
  const from = toDate(query.from, 'from', errors);
  const to = toDate(query.to, 'to', errors, true);
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = from;
    if (to) filter.createdAt.$lte = to;
  }
  if (Object.keys(errors).length) throw badRequest(`Invalid filter: ${Object.values(errors).join('; ')}`, errors);
  return filter;
};

const listAuditLogs = async (query = {}) => {
  const { PlatformAuditLog } = platformModels.getPlatformModels();
  const page = toInt(query.page, 1);
  const limit = Math.min(toInt(query.limit, DEFAULT_LIMIT), MAX_LIMIT);
  const filter = buildFilter(query);

  const [entries, total] = await Promise.all([
    PlatformAuditLog.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    PlatformAuditLog.countDocuments(filter),
  ]);
  return {
    entries,
    pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
  };
};

/** Distinct action names, for the console's filter dropdown. */
const listAuditActions = async () => {
  const { PlatformAuditLog } = platformModels.getPlatformModels();
  const actions = await PlatformAuditLog.distinct('action');
  return { actions: actions.sort(), targetTypes: [...TARGET_TYPES] };
};

module.exports = { listAuditLogs, listAuditActions, buildFilter, MAX_LIMIT };
