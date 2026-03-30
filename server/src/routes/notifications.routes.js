const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const {
  getUserNotifications, markAsRead, markAllAsRead, getUnreadCount,
} = require('../services/notification.service');
const { getPendingApprovalsSummary } = require('../services/pendingApprovals.service');

// All routes are protected
router.use(protect);

// GET /api/notifications
router.get('/', async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const result = await getUserNotifications(req.user._id, page);
  res.json({ success: true, data: result });
});

// GET /api/notifications/unread-count
router.get('/unread-count', async (req, res) => {
  const count = await getUnreadCount(req.user._id);
  res.json({ success: true, data: { count } });
});

// GET /api/notifications/pending-approvals
router.get('/pending-approvals', async (req, res) => {
  const summary = await getPendingApprovalsSummary(req.user);
  res.json({ success: true, data: summary });
});

// PUT /api/notifications/:id/read
router.put('/:id/read', async (req, res) => {
  await markAsRead(req.params.id, req.user._id);
  res.json({ success: true });
});

// PUT /api/notifications/mark-all-read
router.put('/mark-all-read', async (req, res) => {
  await markAllAsRead(req.user._id);
  res.json({ success: true });
});

module.exports = router;
