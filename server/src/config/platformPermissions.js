/**
 * Platform permissions: what LogiForce staff (platform users) may do in the
 * platform console. Separate from config/permissions.js, which lists what a
 * company's own users may do.
 *
 * The two sets never mix:
 *   - every platform key starts with 'platform.'; no tenant key does;
 *   - a platform key can't be put in a company role, role template or user
 *     override (see isPlatformPermission in config/permissions.js);
 *   - a tenant key can't be put in a platform role (models/PlatformRole.js).
 *
 * Pure data: requiring this file must never load a Mongoose model.
 */

const PLATFORM_PERMISSIONS = Object.freeze({
  'platform.tenants.view': {
    label: 'View companies', group: 'Companies',
    description: 'See the company list and each company\'s details, admins and status',
  },
  'platform.tenants.create': {
    label: 'Create companies', group: 'Companies',
    description: 'Provision a new company (database, roles, admin invite)',
  },
  'platform.tenants.edit': {
    label: 'Edit company details', group: 'Companies',
    description: 'Change a company\'s name, contact and limits',
  },
  'platform.tenants.manage_modules': {
    label: 'Manage modules and allowed roles', group: 'Companies',
    description: 'Turn modules on or off and choose which role templates a company may use',
  },
  'platform.tenants.suspend': {
    label: 'Suspend, reactivate and archive', group: 'Companies',
    description: 'Block or restore a company\'s access. Archiving keeps the data',
  },
  'platform.tenant_admins.invite': {
    label: 'Invite company admins', group: 'Company admins',
    description: 'Add an admin to a company and email them a set-password link',
  },
  'platform.tenant_admins.resend_invite': {
    label: 'Resend admin invites', group: 'Company admins',
    description: 'Email a company admin a new set-password link',
  },
  'platform.tenant_admins.reset_password': {
    label: 'Reset admin passwords', group: 'Company admins',
    description: 'Email a company admin a password-reset link. Nobody ever sees a password',
  },
  'platform.role_templates.view': {
    label: 'View role templates', group: 'Role templates',
    description: 'See the roles offered to companies and their permissions',
  },
  'platform.role_templates.manage': {
    label: 'Edit role templates', group: 'Role templates',
    description: 'Change role templates; the change is copied into every company that uses them',
  },
  'platform.users.view': {
    label: 'View platform users', group: 'Platform access',
    description: 'See LogiForce staff accounts and their roles',
  },
  'platform.users.manage': {
    label: 'Manage platform users', group: 'Platform access',
    description: 'Invite staff, change their role, deactivate or reactivate them',
  },
  'platform.roles.manage': {
    label: 'Manage platform roles', group: 'Platform access',
    description: 'Create, edit and delete platform roles',
  },
  'platform.audit.view': {
    label: 'View audit log', group: 'Audit',
    description: 'Read the platform audit log',
  },
});

const PLATFORM_PERMISSION_KEYS = Object.freeze(Object.keys(PLATFORM_PERMISSIONS));

const isPlatformPermissionKey = (key) => typeof key === 'string'
  && Object.prototype.hasOwnProperty.call(PLATFORM_PERMISSIONS, key);

const PLATFORM_OWNER_ROLE_KEY = 'platform_owner';
const PLATFORM_SUPPORT_ROLE_KEY = 'platform_support';

/**
 * Roles every platform database has. They are written by the bootstrap
 * (`npm run platform:create-owner`, `npm run platform:seed`), never on server
 * start.
 *
 * platform_owner is locked: it always holds exactly PLATFORM_PERMISSION_KEYS
 * (so a permission added here reaches it without a migration), and it can't
 * be edited or deleted. That list is the Owner's only source of access: there
 * is no "if owner then allow" anywhere.
 *
 * platform_support is only a starting point; an Owner can edit it.
 */
const SYSTEM_PLATFORM_ROLES = Object.freeze({
  [PLATFORM_OWNER_ROLE_KEY]: Object.freeze({
    key: PLATFORM_OWNER_ROLE_KEY,
    displayName: 'Platform Owner',
    description: 'Full access to the platform',
    permissions: PLATFORM_PERMISSION_KEYS,
    isSystem: true,
  }),
  [PLATFORM_SUPPORT_ROLE_KEY]: Object.freeze({
    key: PLATFORM_SUPPORT_ROLE_KEY,
    displayName: 'Client Support',
    description: 'Views companies and helps their admins get in',
    permissions: Object.freeze([
      'platform.tenants.view',
      'platform.tenant_admins.resend_invite',
      'platform.tenant_admins.reset_password',
      'platform.role_templates.view',
      'platform.audit.view',
    ]),
    isSystem: false,
  }),
});

/** A role whose permissions come from code and can't be changed or deleted. */
const isLockedPlatformRole = (key) => SYSTEM_PLATFORM_ROLES[key]?.isSystem === true;

/**
 * The permissions a platform role grants. Locked roles use the code list;
 * every other role uses what is stored, minus keys that no longer exist.
 *
 * @param {{ key: string, permissions?: string[] } | null} role
 * @returns {string[]}
 */
const platformRolePermissions = (role) => {
  if (!role) return [];
  if (isLockedPlatformRole(role.key)) return [...SYSTEM_PLATFORM_ROLES[role.key].permissions];
  return [...new Set((role.permissions || []).filter(isPlatformPermissionKey))];
};

/** Permissions grouped for the console's permission grid. */
const platformPermissionsByGroup = () => {
  const groups = {};
  for (const [key, p] of Object.entries(PLATFORM_PERMISSIONS)) {
    (groups[p.group] ||= []).push({ key, label: p.label, description: p.description });
  }
  return groups;
};

module.exports = {
  PLATFORM_PERMISSIONS,
  PLATFORM_PERMISSION_KEYS,
  PLATFORM_OWNER_ROLE_KEY,
  PLATFORM_SUPPORT_ROLE_KEY,
  SYSTEM_PLATFORM_ROLES,
  isPlatformPermissionKey,
  isLockedPlatformRole,
  platformRolePermissions,
  platformPermissionsByGroup,
};
