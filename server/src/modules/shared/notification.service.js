const { getModel } = require('../../config/modelRegistry');

async function notifyUsers(req, userIds, payload) {
  const AppNotification = getModel(req, 'AppNotification');
  if (!userIds || !userIds.length) return 0;
  await AppNotification.insertMany(
    userIds.map((uid) => ({ recipientId: uid, ...payload }))
  );
  return userIds.length;
}

/**
 * @deprecated Use notifyByPermission() instead — it is decoupled from role names.
 */
async function notifyByRole(req, roleNames, payload) {
  const Role = getModel(req, 'Role');
  const User = getModel(req, 'User');
  const roles = await Role.find({ name: { $in: roleNames } }).select('_id');
  const users = await User.find({
    roleId: { $in: roles.map((r) => r._id) },
    isActive: true,
  }).select('_id name');

  if (!users.length) return 0;
  await notifyUsers(req, users.map((u) => u._id), payload);
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
async function notifyByPermission(req, permissionKey, payload) {
  const Role = getModel(req, 'Role');
  const User = getModel(req, 'User');
  const AppNotification = getModel(req, 'AppNotification');
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

async function getUnreadCount(req, userId) {
  const AppNotification = getModel(req, 'AppNotification');
  return AppNotification.countDocuments({ recipientId: userId, isRead: false });
}

async function getUserNotifications(req, userId, page = 1, limit = 20, { filter, type } = {}) {
  const AppNotification = getModel(req, 'AppNotification');
  const skip = (page - 1) * limit;
  const query = { recipientId: userId };

  // Apply read-status filter
  if (filter === 'unread') {
    query.isRead = false;
  }

  // Apply type-category filter
  const typeMap = {
    attendance: [
      'attendance_uploaded', 'attendance_approved',
      'attendance_fully_approved', 'attendance_disputed', 'dispute_responded',
    ],
    invoices: ['invoice_generated'],
    salary: [
      'salary_run_ready', 'salary_ops_approved', 'salary_compliance_approved',
      'salary_accounts_approved', 'salary_processed', 'salary_approval_reminder',
    ],
    advances: ['advance_requested', 'advance_approved', 'advance_rejected'],
    credit_notes: [
      'credit_note_created', 'credit_note_sent',
      'credit_note_adjusted', 'credit_note_settled',
    ],
  };
  if (type && typeMap[type]) {
    query.type = { $in: typeMap[type] };
  }

  const [notifications, total, unreadCount] = await Promise.all([
    AppNotification.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    AppNotification.countDocuments(query),
    AppNotification.countDocuments({ recipientId: userId, isRead: false }),
  ]);
  return { notifications, total, unreadCount, page, limit };
}

async function markAsRead(req, notificationId, userId) {
  const AppNotification = getModel(req, 'AppNotification');
  await AppNotification.findOneAndUpdate(
    { _id: notificationId, recipientId: userId },
    { isRead: true, readAt: new Date() }
  );
}

async function markAllAsRead(req, userId) {
  const AppNotification = getModel(req, 'AppNotification');
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
