const { AppNotification, User, Role } = require('../models');

async function notifyUsers(userIds, payload) {
  if (!userIds || !userIds.length) return 0;
  await AppNotification.insertMany(
    userIds.map((uid) => ({ recipientId: uid, ...payload }))
  );
  return userIds.length;
}

async function notifyByRole(roleNames, payload) {
  const roles = await Role.find({ name: { $in: roleNames } }).select('_id');
  const users = await User.find({
    roleId: { $in: roles.map((r) => r._id) },
    isActive: true,
  }).select('_id name');

  if (!users.length) return 0;
  await notifyUsers(users.map((u) => u._id), payload);
  return users.length;
}

async function getUnreadCount(userId) {
  return AppNotification.countDocuments({ recipientId: userId, isRead: false });
}

async function getUserNotifications(userId, page = 1, limit = 20) {
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
  return { notifications, total, unreadCount, page, limit };
}

async function markAsRead(notificationId, userId) {
  await AppNotification.findOneAndUpdate(
    { _id: notificationId, recipientId: userId },
    { isRead: true, readAt: new Date() }
  );
}

async function markAllAsRead(userId) {
  await AppNotification.updateMany(
    { recipientId: userId, isRead: false },
    { isRead: true, readAt: new Date() }
  );
}

module.exports = {
  notifyUsers,
  notifyByRole,
  getUnreadCount,
  getUserNotifications,
  markAsRead,
  markAllAsRead,
};
