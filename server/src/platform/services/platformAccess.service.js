/**
 * What a platform user may do: the permissions of their PlatformRole.
 *
 * This is the only place platform access is worked out. protectPlatform calls
 * it on every request, so a role or permission change applies to existing
 * tokens at once. There is no owner bypass: the Owner's access is the
 * platform_owner role's permission list (config/platformPermissions.js).
 */
const platformModels = require('../models');
const { platformRolePermissions } = require('../../config/platformPermissions');

/**
 * @param {{ roleKey?: string }} user
 * @returns {Promise<{ roleKey: string|null, roleName: string|null, permissions: string[] }>}
 *   permissions is [] when the user's role doesn't exist (any more).
 */
const loadPlatformAccess = async (user) => {
  const roleKey = user?.roleKey || null;
  if (!roleKey) return { roleKey: null, roleName: null, permissions: [] };
  const { PlatformRole } = platformModels.getPlatformModels();
  const role = await PlatformRole.findOne({ key: roleKey }).select('key displayName permissions').lean();
  return {
    roleKey,
    roleName: role?.displayName ?? null,
    permissions: platformRolePermissions(role),
  };
};

module.exports = { loadPlatformAccess };
