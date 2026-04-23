const express = require('express');
const router = express.Router();
const { protect, requirePermission } = require('../../middleware/auth');
const { getModel } = require('../../config/modelRegistry');
const { sendSuccess, sendError } = require('../../utils/responseHelper');

router.use(protect);

// Normalise a DriverHistory doc into the unified activity-log shape
const fromDriverHistory = (h) => ({
  _id: `dh-${h._id}`,
  source: 'driver_history',
  timestamp: h.createdAt,
  userId: typeof h.performedBy === 'object' ? h.performedBy?._id : h.performedBy,
  userName: h.performedByName,
  userEmail: typeof h.performedBy === 'object' ? h.performedBy?.email : null,
  userRole: h.performedByRole,
  action: h.eventType,
  entityType: 'drivers',
  entityId: typeof h.driverId === 'object' ? String(h.driverId?._id) : String(h.driverId || ''),
  entityLabel: typeof h.driverId === 'object'
    ? (h.driverId?.employeeCode ? `${h.driverId.employeeCode} · ${h.driverId.fullName || ''}` : h.driverId?.fullName)
    : null,
  description: h.description,
  oldValue: h.oldValue,
  newValue: h.newValue,
  reason: h.reason,
  method: null,
});

// Normalise an AuditLog doc into the unified activity-log shape
const fromAuditLog = (a) => ({
  _id: `al-${a._id}`,
  source: 'audit_log',
  timestamp: a.timestamp,
  userId: typeof a.userId === 'object' ? a.userId?._id : a.userId,
  userName: a.userName,
  userEmail: a.userEmail,
  userRole: a.userRole,
  action: a.action,
  entityType: a.entityType,
  entityId: a.entityId,
  entityLabel: a.entityLabel,
  description: a.description || `${a.method || ''} ${a.path || ''}`.trim(),
  method: a.method,
  statusCode: a.statusCode,
  ip: a.ip,
});

// GET /api/activity-log — merged log from DriverHistory + AuditLog
router.get('/', requirePermission('activity_log.view'), async (req, res) => {
  try {
    const DriverHistory = getModel(req, 'DriverHistory');
    const AuditLog = getModel(req, 'AuditLog');

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));

    const driverHistoryQuery = {};
    const auditLogQuery = {};
    // DriverHistory only covers drivers — if filter narrows to another module, skip it
    let skipDriverHistory = false;

    if (req.query.userId) {
      driverHistoryQuery.performedBy = req.query.userId;
      auditLogQuery.userId = req.query.userId;
    }
    if (req.query.entityType) {
      auditLogQuery.entityType = req.query.entityType;
      if (req.query.entityType !== 'drivers') skipDriverHistory = true;
    }
    if (req.query.entityId) {
      driverHistoryQuery.driverId = req.query.entityId;
      auditLogQuery.entityId = req.query.entityId;
    }
    if (req.query.action) {
      driverHistoryQuery.eventType = req.query.action;
      auditLogQuery.action = req.query.action;
    }
    if (req.query.from || req.query.to) {
      const range = {};
      if (req.query.from) range.$gte = new Date(req.query.from);
      if (req.query.to) {
        const to = new Date(req.query.to);
        to.setHours(23, 59, 59, 999);
        range.$lte = to;
      }
      driverHistoryQuery.createdAt = range;
      auditLogQuery.timestamp = range;
    }

    // Over-fetch from each source so merged pagination stays accurate enough
    const overFetch = page * limit + limit;

    const dhPromise = skipDriverHistory
      ? Promise.resolve([])
      : DriverHistory.find(driverHistoryQuery)
          .sort({ createdAt: -1 })
          .limit(overFetch)
          .populate('performedBy', 'name email')
          .populate('driverId', 'fullName employeeCode')
          .lean();

    const alPromise = AuditLog.find(auditLogQuery)
      .sort({ timestamp: -1 })
      .limit(overFetch)
      .lean();

    const [dhDocs, alDocs] = await Promise.all([dhPromise, alPromise]);

    const merged = [
      ...dhDocs.map(fromDriverHistory),
      ...alDocs.map(fromAuditLog),
    ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    const total = merged.length; // approximate — bounded by overFetch
    const start = (page - 1) * limit;
    const entries = merged.slice(start, start + limit);

    sendSuccess(res, { entries, total, page, limit });
  } catch (err) {
    sendError(res, err.message || 'Failed to fetch activity log', 500);
  }
});

// GET /api/activity-log/users — distinct users who have performed actions
router.get('/users', requirePermission('activity_log.view'), async (req, res) => {
  try {
    const DriverHistory = getModel(req, 'DriverHistory');
    const AuditLog = getModel(req, 'AuditLog');
    const User = getModel(req, 'User');

    const [dhIds, alIds] = await Promise.all([
      DriverHistory.distinct('performedBy'),
      AuditLog.distinct('userId'),
    ]);
    const idSet = new Set([
      ...dhIds.filter(Boolean).map(String),
      ...alIds.filter(Boolean).map(String),
    ]);
    const users = await User.find({ _id: { $in: [...idSet] } })
      .select('name email')
      .sort({ name: 1 })
      .lean();

    sendSuccess(res, users);
  } catch (err) {
    sendError(res, err.message || 'Failed to fetch users', 500);
  }
});

// GET /api/activity-log/entity-types — list of entity types seen in the logs
router.get('/entity-types', requirePermission('activity_log.view'), async (req, res) => {
  try {
    const AuditLog = getModel(req, 'AuditLog');
    const types = await AuditLog.distinct('entityType');
    sendSuccess(res, ['drivers', ...types.filter((t) => t && t !== 'drivers')].sort());
  } catch (err) {
    sendError(res, err.message || 'Failed to fetch entity types', 500);
  }
});

module.exports = router;
