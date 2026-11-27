/**
 * Platform users and platform roles, managed from the console.
 *
 *   /api/platform/users   list, invite, change role, deactivate, reactivate, resend invite
 *   /api/platform/roles   list, create, edit, delete
 *
 * Rules, enforced here whatever the console shows:
 *   - nobody can change their own role, deactivate themselves, or edit the
 *     role they are on;
 *   - you can only give a role, or put permissions in a role, that you hold
 *     yourself (every permission of it);
 *   - you can only manage a user whose current role you could give;
 *   - only a Platform Owner can make another user an Owner;
 *   - there is always at least one active Owner: the last one can't be
 *     deactivated or moved to another role;
 *   - the platform_owner role is locked (config/platformPermissions.js).
 *
 * `actor` is req.platformUser: { _id, email, roleKey, permissions }.
 * Every change is written to the platform audit log.
 */
const platformModels = require('../models');
const {
  PLATFORM_OWNER_ROLE_KEY,
  isPlatformPermissionKey,
  isLockedPlatformRole,
  platformRolePermissions,
  platformPermissionsByGroup,
} = require('../../config/platformPermissions');
const { PLATFORM_ROLE_KEY_PATTERN } = require('../models/PlatformRole');
const platformUsers = require('./platformUser.service');
const { notFound, badRequest, conflict, forbidden } = require('../errors');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OBJECT_ID = /^[a-f0-9]{24}$/i;

const auditActor = (actor) => ({ userId: actor._id, email: actor.email });
const sameId = (a, b) => String(a) === String(b);
const isOwner = (user) => user?.roleKey === PLATFORM_OWNER_ROLE_KEY;

const missingPermissions = (actor, permissions) => permissions.filter((p) => !actor.permissions.includes(p));

// ── Shared checks ──

/** `actor` may give `role` to someone (or keep someone on it). */
const assertCanGrantRole = (actor, role) => {
  if (role.key === PLATFORM_OWNER_ROLE_KEY && !isOwner(actor)) {
    throw forbidden('OWNER_ONLY', 'Only a Platform Owner can make someone an Owner');
  }
  const missing = missingPermissions(actor, platformRolePermissions(role));
  if (missing.length) {
    throw forbidden('GRANT_EXCEEDS_OWN_ACCESS', `You can't give access you don't have: ${missing.join(', ')}`);
  }
};

const findRoleOr = async (key, onMissing) => {
  const { PlatformRole } = platformModels.getPlatformModels();
  const role = await PlatformRole.findOne({ key: String(key || '').trim().toLowerCase() }).lean();
  if (!role) throw onMissing();
  return role;
};

const findUserOr404 = async (id) => {
  if (!OBJECT_ID.test(String(id))) throw notFound('No such platform user');
  const { PlatformUser } = platformModels.getPlatformModels();
  const user = await PlatformUser.findById(id).lean();
  if (!user) throw notFound('No such platform user');
  return user;
};

/** `actor` may change `target`: not themselves, and only someone whose role they could give. */
const assertCanManageUser = async (actor, target, what) => {
  if (sameId(actor._id, target._id)) throw forbidden('SELF_CHANGE', `You can't ${what} yourself`);
  const { PlatformRole } = platformModels.getPlatformModels();
  const role = await PlatformRole.findOne({ key: target.roleKey }).lean();
  // A user on a role that no longer exists holds nothing; only the Owner check applies.
  assertCanGrantRole(actor, role || { key: target.roleKey, permissions: [] });
};

/** Refuse when `target` is the last active Owner. */
const assertNotLastOwner = async (target, what) => {
  if (!isOwner(target) || target.isActive !== true) return;
  const { PlatformUser } = platformModels.getPlatformModels();
  const others = await PlatformUser.countDocuments({
    roleKey: PLATFORM_OWNER_ROLE_KEY, isActive: true, _id: { $ne: target._id },
  });
  if (others === 0) {
    throw conflict('LAST_OWNER', `You can't ${what} the last active Platform Owner. Make someone else an Owner first.`);
  }
};

/**
 * After removing an Owner: if no active Owner is left (two Owners removed each
 * other at the same moment), put `target` back and refuse.
 */
const undoIfNoOwnerLeft = async (target, undo) => {
  if (!isOwner(target) || target.isActive !== true) return;
  const { PlatformUser } = platformModels.getPlatformModels();
  const left = await PlatformUser.countDocuments({ roleKey: PLATFORM_OWNER_ROLE_KEY, isActive: true });
  if (left > 0) return;
  await PlatformUser.updateOne({ _id: target._id }, undo);
  throw conflict('LAST_OWNER', 'There must always be at least one active Platform Owner.');
};

// ── Users ──

const publicPlatformUser = (u, rolesByKey) => ({
  _id: u._id,
  email: u.email,
  name: u.name,
  roleKey: u.roleKey,
  roleName: rolesByKey?.get(u.roleKey)?.displayName ?? null,
  isActive: u.isActive === true,
  invitePending: !u.passwordHash,
  lastLoginAt: u.lastLoginAt ?? null,
  invitedBy: u.invitedBy ?? null,
  createdAt: u.createdAt ?? null,
});

const rolesMap = async () => {
  const { PlatformRole } = platformModels.getPlatformModels();
  const roles = await PlatformRole.find({}).lean();
  return new Map(roles.map((r) => [r.key, r]));
};

const listUsers = async () => {
  const { PlatformUser } = platformModels.getPlatformModels();
  const users = await PlatformUser.find({}).select('+passwordHash').sort({ createdAt: 1 }).lean();
  const roles = await rolesMap();
  return { users: users.map((u) => publicPlatformUser(u, roles)) };
};

/**
 * Create a platform user without a password and email them a set-password
 * link. If the email fails the user still exists (invitePending) and the error
 * is reported; POST /users/:id/resend-invite sends a new link.
 */
const inviteUser = async ({ body = {}, actor, req }) => {
  const email = platformUsers.normalizeEmail(body.email);
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const errors = {};
  if (!EMAIL_PATTERN.test(email)) errors.email = 'A valid email is required';
  if (!name) errors.name = 'Name is required';
  if (!body.roleKey) errors.roleKey = 'Role is required';
  if (Object.keys(errors).length) throw badRequest(`Invalid request: ${Object.values(errors).join('; ')}`, errors);

  const role = await findRoleOr(body.roleKey, () => badRequest(`No platform role "${body.roleKey}"`, { roleKey: 'unknown role' }));
  assertCanGrantRole(actor, role);

  if (await platformUsers.findPlatformUserByEmail(email)) {
    throw conflict('EMAIL_TAKEN', `${email} already has a platform account`);
  }

  const user = await platformUsers.createInvitedPlatformUser({
    email, name, roleKey: role.key, invitedBy: actor._id, actor: auditActor(actor), req,
  });

  let invite;
  try {
    invite = { ...(await platformUsers.sendPlatformSetPasswordLink({ userId: user._id, actor: auditActor(actor), req })), sent: true };
  } catch (err) {
    invite = { sent: false, error: err.message };
  }
  const { PlatformUser } = platformModels.getPlatformModels();
  const saved = await PlatformUser.findById(user._id).select('+passwordHash').lean();
  return { user: publicPlatformUser(saved, await rolesMap()), invite };
};

const resendUserInvite = async ({ id, actor, req }) => {
  const target = await findUserOr404(id);
  await assertCanManageUser(actor, target, 'resend an invite to');
  if (target.isActive !== true) throw conflict('USER_INACTIVE', 'Reactivate this user first');
  const invite = await platformUsers.sendPlatformSetPasswordLink({ userId: target._id, actor: auditActor(actor), req });
  return { invite };
};

const changeUserRole = async ({ id, roleKey, actor, req }) => {
  const target = await findUserOr404(id);
  await assertCanManageUser(actor, target, 'change the role of');
  const role = await findRoleOr(roleKey, () => badRequest(`No platform role "${roleKey}"`, { roleKey: 'unknown role' }));
  assertCanGrantRole(actor, role);
  if (role.key === target.roleKey) return { user: publicPlatformUser(target, await rolesMap()), changed: false };
  if (role.key !== PLATFORM_OWNER_ROLE_KEY) await assertNotLastOwner(target, 'change the role of');

  const { PlatformUser, PlatformAuditLog } = platformModels.getPlatformModels();
  const saved = await PlatformUser.findOneAndUpdate(
    { _id: target._id, roleKey: target.roleKey },
    { $set: { roleKey: role.key } },
    { new: true }
  ).lean();
  if (!saved) throw conflict('USER_CHANGED', 'This user changed while saving; reload and try again.');
  await undoIfNoOwnerLeft(target, { $set: { roleKey: target.roleKey } });

  await PlatformAuditLog.record({
    actor: auditActor(actor),
    action: 'platformUser.role_change',
    targetType: 'PlatformUser',
    targetId: target._id,
    targetKey: target.email,
    before: { roleKey: target.roleKey },
    after: { roleKey: role.key },
    req,
  });
  return { user: publicPlatformUser(saved, await rolesMap()), changed: true };
};

const setUserActive = async ({ id, active, actor, req }) => {
  const target = await findUserOr404(id);
  await assertCanManageUser(actor, target, active ? 'reactivate' : 'deactivate');
  if ((target.isActive === true) === active) return { user: publicPlatformUser(target, await rolesMap()), changed: false };
  if (!active) await assertNotLastOwner(target, 'deactivate');

  const { PlatformUser, PlatformAuditLog, PlatformLoginChallenge } = platformModels.getPlatformModels();
  const update = active
    ? { $set: { isActive: true } }
    : { $set: { isActive: false }, $inc: { tokenVersion: 1 } }; // signs out every session
  const saved = await PlatformUser.findOneAndUpdate(
    { _id: target._id, isActive: target.isActive === true },
    update,
    { new: true }
  ).lean();
  if (!saved) throw conflict('USER_CHANGED', 'This user changed while saving; reload and try again.');
  if (!active) {
    await undoIfNoOwnerLeft(target, { $set: { isActive: true } });
    await PlatformLoginChallenge.deleteMany({ userId: target._id });
  }

  await PlatformAuditLog.record({
    actor: auditActor(actor),
    action: active ? 'platformUser.reactivate' : 'platformUser.deactivate',
    targetType: 'PlatformUser',
    targetId: target._id,
    targetKey: target.email,
    before: { isActive: target.isActive === true },
    after: { isActive: active },
    req,
  });
  return { user: publicPlatformUser(saved, await rolesMap()), changed: true };
};

// ── Roles ──

const publicRole = (r, userCount) => ({
  _id: r._id,
  key: r.key,
  displayName: r.displayName,
  description: r.description || '',
  permissions: platformRolePermissions(r),
  isSystem: r.isSystem === true,
  locked: isLockedPlatformRole(r.key),
  userCount,
});

const listRoles = async () => {
  const { PlatformRole, PlatformUser } = platformModels.getPlatformModels();
  const roles = await PlatformRole.find({}).sort({ createdAt: 1 }).lean();
  const result = [];
  for (const r of roles) result.push(publicRole(r, await PlatformUser.countDocuments({ roleKey: r.key })));
  return { roles: result, permissionsByGroup: platformPermissionsByGroup() };
};

const validatePermissions = (actor, permissions) => {
  if (!Array.isArray(permissions) || permissions.some((p) => typeof p !== 'string')) {
    throw badRequest('permissions must be an array of platform permission keys', { permissions: 'not an array of keys' });
  }
  const keys = [...new Set(permissions)];
  const unknown = keys.filter((k) => !isPlatformPermissionKey(k));
  if (unknown.length) {
    throw badRequest(`Not platform permission(s): ${unknown.join(', ')}`, { permissions: `unknown: ${unknown.join(', ')}` });
  }
  const missing = missingPermissions(actor, keys);
  if (missing.length) {
    throw forbidden('GRANT_EXCEEDS_OWN_ACCESS', `You can't give access you don't have: ${missing.join(', ')}`);
  }
  return keys;
};

const roleSnapshot = (r) => ({
  key: r.key, displayName: r.displayName, description: r.description, permissions: [...(r.permissions || [])],
});

const createRole = async ({ body = {}, actor, req }) => {
  const key = typeof body.key === 'string' ? body.key.trim().toLowerCase() : '';
  const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : '';
  const errors = {};
  if (!PLATFORM_ROLE_KEY_PATTERN.test(key)) errors.key = 'Key must be 2–41 characters: a lowercase letter, then lowercase letters, digits or underscores';
  if (!displayName) errors.displayName = 'Display name is required';
  if (Object.keys(errors).length) throw badRequest(`Invalid request: ${Object.values(errors).join('; ')}`, errors);
  const permissions = validatePermissions(actor, body.permissions ?? []);

  const { PlatformRole, PlatformAuditLog } = platformModels.getPlatformModels();
  if (await PlatformRole.findOne({ key }).lean()) throw conflict('ROLE_KEY_TAKEN', `A platform role "${key}" already exists`);
  const doc = await PlatformRole.create({
    key,
    displayName,
    description: typeof body.description === 'string' ? body.description.trim() : '',
    permissions,
    isSystem: false,
    createdBy: actor._id,
  });
  const role = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  await PlatformAuditLog.record({
    actor: auditActor(actor),
    action: 'platformRole.create',
    targetType: 'PlatformRole',
    targetId: role._id,
    targetKey: role.key,
    before: null,
    after: roleSnapshot(role),
    req,
  });
  return { role: publicRole(role, 0) };
};

/** Checks shared by edit and delete. */
const assertCanChangeRole = (actor, role, what) => {
  if (isLockedPlatformRole(role.key)) throw forbidden('ROLE_LOCKED', `The ${role.displayName} role can't be ${what}`);
  if (role.key === actor.roleKey) throw forbidden('SELF_CHANGE', `You can't ${what === 'edited' ? 'edit' : 'delete'} your own role`);
  const missing = missingPermissions(actor, platformRolePermissions(role));
  if (missing.length) {
    throw forbidden('GRANT_EXCEEDS_OWN_ACCESS', `This role has access you don't have: ${missing.join(', ')}`);
  }
};

const updateRole = async ({ key, body = {}, actor, req }) => {
  const role = await findRoleOr(key, () => notFound(`No platform role "${key}"`));
  assertCanChangeRole(actor, role, 'edited');

  const allowed = ['displayName', 'description', 'permissions'];
  const unknown = Object.keys(body).filter((k) => !allowed.includes(k));
  if (unknown.length) throw badRequest(`Unknown field(s): ${unknown.join(', ')}. Allowed: ${allowed.join(', ')}`);
  const set = {};
  if (body.displayName !== undefined) {
    if (typeof body.displayName !== 'string' || !body.displayName.trim()) throw badRequest('Display name cannot be empty');
    set.displayName = body.displayName.trim();
  }
  if (body.description !== undefined) set.description = String(body.description || '').trim();
  if (body.permissions !== undefined) set.permissions = validatePermissions(actor, body.permissions);
  if (Object.keys(set).length === 0) return { role: publicRole(role, null), changed: false };

  const { PlatformRole, PlatformAuditLog } = platformModels.getPlatformModels();
  const saved = await PlatformRole.findOneAndUpdate({ _id: role._id }, { $set: set }, { new: true, runValidators: true }).lean();
  await PlatformAuditLog.record({
    actor: auditActor(actor),
    action: 'platformRole.update',
    targetType: 'PlatformRole',
    targetId: role._id,
    targetKey: role.key,
    before: roleSnapshot(role),
    after: roleSnapshot(saved),
    req,
  });
  return { role: publicRole(saved, null), changed: true };
};

const deleteRole = async ({ key, actor, req }) => {
  const role = await findRoleOr(key, () => notFound(`No platform role "${key}"`));
  assertCanChangeRole(actor, role, 'deleted');
  const { PlatformRole, PlatformUser, PlatformAuditLog } = platformModels.getPlatformModels();
  const users = await PlatformUser.countDocuments({ roleKey: role.key });
  if (users > 0) throw conflict('ROLE_IN_USE', `${users} platform user(s) are on this role; move them first`);
  await PlatformRole.deleteOne({ _id: role._id });
  await PlatformAuditLog.record({
    actor: auditActor(actor),
    action: 'platformRole.delete',
    targetType: 'PlatformRole',
    targetId: role._id,
    targetKey: role.key,
    before: roleSnapshot(role),
    after: null,
    req,
  });
  return { deleted: role.key };
};

module.exports = {
  listUsers,
  inviteUser,
  resendUserInvite,
  changeUserRole,
  setUserActive,
  listRoles,
  createRole,
  updateRole,
  deleteRole,
};
