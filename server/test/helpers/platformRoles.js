/**
 * Platform roles and users for tests, in the shape the platform DB stores.
 */
const mongoose = require('mongoose');
const { SYSTEM_PLATFORM_ROLES } = require('../../src/config/platformPermissions');

const { ObjectId } = mongoose.Types;

/** One PlatformRole document per system role (platform_owner, platform_support). */
const systemRoleDocs = () => Object.values(SYSTEM_PLATFORM_ROLES).map((r) => ({
  _id: new ObjectId(),
  key: r.key,
  displayName: r.displayName,
  description: r.description,
  permissions: [...r.permissions],
  isSystem: r.isSystem,
}));

/** A platform user document on `roleKey`. */
const platformUserDoc = (roleKey, fields = {}) => ({
  _id: new ObjectId(),
  email: `${roleKey}-${new ObjectId().toString().slice(-6)}@platform.test`,
  name: roleKey,
  roleKey,
  isActive: true,
  tokenVersion: 0,
  ...fields,
});

module.exports = { systemRoleDocs, platformUserDoc };
