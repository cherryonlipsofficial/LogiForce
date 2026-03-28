const { AppNotification, User, Role } = require('../models');

const PAGINATION_LIMIT = 20;

/**
 * Send notifications to specific users by ID.
 */
async function notifyUsers(userIds, notification) {
  const notifications = userIds.map((uid) => ({
    recipientId: uid,
    ...notification,
  }));

  if (notifications.length > 0) {
    await AppNotification.insertMany(notifications);
  }

  return notifications;
}

/**
 * Send notifications to all active users with the given role names.
 */
async function notifyByRole(roleNames, payload) {
  const roles = await Role.find({ name: { $in: roleNames }, isActive: true }).select('_id');
  const roleIds = roles.map((r) => r._id);

  const users = await User.find({ roleId: { $in: roleIds }, isActive: true }).select('_id name roleId').populate('roleId', 'name');

  const notifications = users.map((u) => ({
    recipientId: u._id,
    recipientRole: u.roleId?.name,
    type: payload.type,
    title: payload.title,
    message: payload.message,
    referenceModel: payload.referenceModel,
    referenceId: payload.referenceId,
    triggeredBy: payload.triggeredBy,
    triggeredByName: payload.triggeredByName,
  }));

  if (notifications.length > 0) {
    await AppNotification.insertMany(notifications);
  }

  return users.length;
}

/**
 * Get paginated notifications for a user.
 */
async function getUserNotifications(userId, page = 1) {
  const limit = PAGINATION_LIMIT;
  const skip = (page - 1) * limit;

  const [notifications, total, unreadCount] = await Promise.all([
    AppNotification.find({ recipientId: userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    AppNotification.countDocuments({ recipientId: userId }),
    AppNotification.countDocuments({ recipientId: userId, isRead: false }),
  ]);

  return {
    notifications,
    total,
    unreadCount,
    page,
    pages: Math.ceil(total / limit),
  };
}

/**
 * Mark a single notification as read.
 */
async function markAsRead(notificationId, userId) {
  await AppNotification.findOneAndUpdate(
    { _id: notificationId, recipientId: userId },
    { isRead: true, readAt: new Date() }
  );
}

/**
 * Mark all notifications as read for a user.
 */
async function markAllAsRead(userId) {
  await AppNotification.updateMany(
    { recipientId: userId, isRead: false },
    { isRead: true, readAt: new Date() }
  );
}

/**
 * Get unread notification count.
 */
async function getUnreadCount(userId) {
  return AppNotification.countDocuments({ recipientId: userId, isRead: false });
}

module.exports = {
  notifyUsers,
  notifyByRole,
  getUserNotifications,
  markAsRead,
  markAllAsRead,
  getUnreadCount,
};
