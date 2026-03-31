const { AppNotification, User, Role } = require('../models');

async function notifyUsers(userIds, payload) {
  if (!userIds || !userIds.length) return 0;
  await AppNotification.insertMany(
    userIds.map((uid) => ({ recipientId: uid, ...payload }))
  );
  return userIds.length;
}

/**
 * @deprecated Use notifyByPermission() instead — it is decoupled from role names.
 */
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

/**
 * Notify all active users who have a specific permission.
 * Queries ALL roles that include the given permission key,
 * then finds all active users assigned to those roles.
 * Also checks user-level permission overrides.
 *
 * This is the PREFERRED method over notifyByRole() because
 * it's decoupled from role names — works even if roles are renamed.
 */
async function notifyByPermission(permissionKey, payload) {
  // 1. Find all roles that contain this permission
  const roles = await Role.find({
    permissions: permissionKey,
    isActive: { $ne: false },
  }).select('_id');

  // 2. Find all active users with those roles
  const roleIds = roles.map(r => r._id);
  const users = await User.find({
    roleId: { $in: roleIds },
    isActive: true,
  }).select('_id name permissionOverrides');

  // 3. Filter out users who have a denial override for this permission
  const eligible = users.filter(u => {
    const override = (u.permissionOverrides || []).find(o => o.key === permissionKey);
    if (override && !override.granted) return false;
    return true;
  });

  // 4. Also include users who DON'T have the role but have an explicit grant override
  const overrideUsers = await User.find({
    roleId: { $nin: roleIds },
    isActive: true,
    'permissionOverrides': {
      $elemMatch: { key: permissionKey, granted: true }
    }
  }).select('_id name');

  const allUserIds = [...new Set([
    ...eligible.map(u => u._id.toString()),
    ...overrideUsers.map(u => u._id.toString()),
  ])];

  if (!allUserIds.length) return 0;

  await AppNotification.insertMany(
    allUserIds.map(uid => ({ recipientId: uid, ...payload }))
  );
  return allUserIds.length;
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
  notifyByPermission,
  getUnreadCount,
  getUserNotifications,
  markAsRead,
  markAllAsRead,
};
