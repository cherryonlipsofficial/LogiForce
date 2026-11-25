const Role = require('../modules/shared/Role');
const { defaultRoles, TENANT_ADMIN_TEMPLATE } = require('../config/defaultRoles');

// The company admin role, shaped the way roleSync writes it (managedBy
// 'platform', linked to the tenant_admin template). Not a system role: there is
// no all-permissions admin any more. The local seed has no tenant ceiling, so it
// gets the template's full permission list; `npm run platform:sync-roles` trims
// it to the company's modules.
const tenantAdminRole = {
  name: TENANT_ADMIN_TEMPLATE.key,
  displayName: TENANT_ADMIN_TEMPLATE.displayName,
  description: TENANT_ADMIN_TEMPLATE.description,
  isSystemRole: false,
  permissions: [...TENANT_ADMIN_TEMPLATE.permissions],
  templateKey: TENANT_ADMIN_TEMPLATE.key,
  managedBy: 'platform',
  assignableByTenant: TENANT_ADMIN_TEMPLATE.assignableByTenant,
  templateVersion: 1,
  isActive: true,
};

const seedRoles = async () => {
  console.log('Seeding roles...');

  const roles = {};
  for (const roleData of [tenantAdminRole, ...defaultRoles]) {
    const role = await Role.findOneAndUpdate(
      { name: roleData.name },
      { $set: roleData },
      { upsert: true, new: true }
    );
    roles[roleData.name] = role;
  }

  console.log(`  Created/updated ${Object.keys(roles).length} roles`);
  return roles;
};

module.exports = { seedRoles, defaultRoles, tenantAdminRole };
