const Role = require('../modules/shared/Role');
const { defaultRoles } = require('../config/defaultRoles');

const seedRoles = async () => {
  console.log('Seeding roles...');

  const roles = {};
  for (const roleData of defaultRoles) {
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

module.exports = { seedRoles, defaultRoles };
