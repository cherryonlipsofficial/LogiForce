const { tenantCeiling, PERMISSIONS } = require('../config/permissions');

// Thrown errors carry statusCode; middleware/errorHandler.js answers with
// { success: false, message } and that status.
const httpError = (statusCode, message) => Object.assign(new Error(message), { statusCode });

// A role is in the company's allowed set when it was copied from one of the
// role templates the platform gave this company (Tenant.roleTemplateKeys).
// Roles with no template link (old company-made roles) are not.
const isInAllowedSet = (req, role) => Boolean(role?.templateKey)
  && (req.tenant?.roleTemplateKeys || []).includes(role.templateKey);

// Why `req` may not assign `role`, or null if it may. Shared by
// assertCanAssignRole and GET /api/roles/assignable so the two cannot drift.
const roleAssignBlocker = (req, role) => {
  if (!role || role.isActive === false || role.assignableByTenant === false) {
    return 'This role is not available to assign';
  }
  if (!isInAllowedSet(req, role)) return 'This role is not offered to this company';
  const mine = new Set(req.userPermissions);
  const extra = (role.permissions || []).filter((k) => !mine.has(k));
  if (extra.length) return `You can't assign access you don't have: ${extra.join(', ')}`;
  return null;
};

const canAssignRole = (req, role) => roleAssignBlocker(req, role) === null;

const assertCanAssignRole = (req, role) => {
  const blocker = roleAssignBlocker(req, role);
  if (blocker) throw httpError(403, blocker);
};

// A company admin is anyone on the platform-managed tenant_admin role.
const isTenantAdmin = (user) => user?.roleId?.templateKey === 'tenant_admin';

const sameUser = (a, b) => String(a?._id ?? a) === String(b?._id ?? b);

/**
 * Checks for changing another user's access (role or permission overrides).
 * `target` must have roleId populated with templateKey.
 */
const assertCanChangeAccessOf = (req, target) => {
  if (sameUser(target, req.user)) throw httpError(403, "You can't change your own access");
  if (isTenantAdmin(target)) throw httpError(403, "You can't change another company admin's access");
};

/**
 * Keys `req`'s user may grant through an override: within the company's
 * ceiling (core + enabled modules, never platform permissions) AND held by the
 * user. GET /api/users/grantable-permissions lists exactly these, and
 * assertCanOverrideKey refuses any grant outside them.
 */
const grantablePermissionKeys = (req) => {
  const ceiling = tenantCeiling(req.tenant);
  return (req.userPermissions || []).filter((key) => ceiling.has(key) && PERMISSIONS[key]);
};

/**
 * Checks for granting (`granted` true) or revoking a single permission key
 * through a user override.
 */
const assertCanOverrideKey = (req, key, granted) => {
  if (!tenantCeiling(req.tenant).has(key)) {
    throw httpError(403, `"${key}" is not available to this company`);
  }
  if (granted && !grantablePermissionKeys(req).includes(key)) {
    throw httpError(403, `You can't grant access you don't have: ${key}`);
  }
};

/**
 * Seat limit. Call before a user becomes active (created active, or switched
 * from inactive to active). tenant.limits.maxUsers null/missing = no limit.
 */
const assertSeatAvailable = async (req, User) => {
  const maxUsers = req.tenant?.limits?.maxUsers;
  if (maxUsers === null || maxUsers === undefined) return;
  const active = await User.countDocuments({ isActive: true });
  if (active + 1 > maxUsers) throw httpError(403, 'User limit reached for this company');
};

module.exports = {
  httpError,
  roleAssignBlocker,
  isInAllowedSet,
  canAssignRole,
  grantablePermissionKeys,
  assertCanAssignRole,
  isTenantAdmin,
  assertCanChangeAccessOf,
  assertCanOverrideKey,
  assertSeatAvailable,
};
