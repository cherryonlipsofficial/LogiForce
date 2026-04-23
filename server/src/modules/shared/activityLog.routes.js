const express = require('express');
const router = express.Router();
const { protect, requirePermission } = require('../../middleware/auth');
const { getModel } = require('../../config/modelRegistry');
const { sendSuccess, sendError } = require('../../utils/responseHelper');

router.use(protect);

// GET /api/activity-log — system-wide activity across drivers
// Filters: userId, driverId, eventType, from, to, page, limit
router.get('/', requirePermission('activity_log.view'), async (req, res) => {
  try {
    const DriverHistory = getModel(req, 'DriverHistory');

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));
    const skip = (page - 1) * limit;

    const query = {};
    if (req.query.userId) query.performedBy = req.query.userId;
    if (req.query.driverId) query.driverId = req.query.driverId;
    if (req.query.eventType) query.eventType = req.query.eventType;

    if (req.query.from || req.query.to) {
      query.createdAt = {};
      if (req.query.from) query.createdAt.$gte = new Date(req.query.from);
      if (req.query.to) {
        const to = new Date(req.query.to);
        to.setHours(23, 59, 59, 999);
        query.createdAt.$lte = to;
      }
    }

    const [entries, total] = await Promise.all([
      DriverHistory.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('performedBy', 'name email')
        .populate('driverId', 'fullName employeeCode')
        .lean(),
      DriverHistory.countDocuments(query),
    ]);

    sendSuccess(res, { entries, total, page, limit });
  } catch (err) {
    sendError(res, err.message || 'Failed to fetch activity log', 500);
  }
});

// GET /api/activity-log/users — distinct users who have performed actions (for filter dropdown)
router.get('/users', requirePermission('activity_log.view'), async (req, res) => {
  try {
    const DriverHistory = getModel(req, 'DriverHistory');
    const User = getModel(req, 'User');

    const userIds = await DriverHistory.distinct('performedBy');
    const users = await User.find({ _id: { $in: userIds } })
      .select('name email')
      .sort({ name: 1 })
      .lean();

    sendSuccess(res, users);
  } catch (err) {
    sendError(res, err.message || 'Failed to fetch users', 500);
  }
});

module.exports = router;
