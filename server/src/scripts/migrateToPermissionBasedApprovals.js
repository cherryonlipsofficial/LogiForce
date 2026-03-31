/**
 * Migration: Update existing data to use permission-based approval stages.
 *
 * Changes:
 * 1. SalaryRun approvals[].stage: 'ops' → 'salary.approve_ops',
 *    'compliance' → 'salary.approve_compliance', 'accounts' → 'salary.approve_accounts'
 * 2. Roles with old 'salary.approve' get new granular permissions
 * 3. Roles with old 'attendance.approve' get new granular permissions
 * 4. Add 'dashboard.*' permissions to appropriate roles
 *
 * Usage: node -e "require('./server/src/scripts/migrateToPermissionBasedApprovals').run()"
 * Or call run() after connecting to MongoDB.
 */

const mongoose = require('mongoose');

const STAGE_MAP = {
  ops: 'salary.approve_ops',
  compliance: 'salary.approve_compliance',
  accounts: 'salary.approve_accounts',
};

async function run() {
  const SalaryRun = mongoose.model('SalaryRun');
  const Role = mongoose.model('Role');

  console.log('=== Migration: Permission-Based Approvals ===\n');

  // 1. Update SalaryRun approval stage strings
  let salaryUpdated = 0;
  for (const [oldStage, newStage] of Object.entries(STAGE_MAP)) {
    const result = await SalaryRun.updateMany(
      { 'approvals.stage': oldStage },
      { $set: { 'approvals.$[elem].stage': newStage } },
      { arrayFilters: [{ 'elem.stage': oldStage }] }
    );
    if (result.modifiedCount > 0) {
      console.log(`  SalaryRun: Updated ${result.modifiedCount} documents — stage '${oldStage}' → '${newStage}'`);
      salaryUpdated += result.modifiedCount;
    }
  }
  if (salaryUpdated === 0) {
    console.log('  SalaryRun: No legacy stage names found (already migrated or no data)');
  }

  // 2. Update roles with old salary.approve → add granular permissions
  const rolesWithSalaryApprove = await Role.find({
    permissions: 'salary.approve',
    isSystemRole: { $ne: true },
  });

  for (const role of rolesWithSalaryApprove) {
    const name = role.name?.toLowerCase();
    const toAdd = [];

    // Determine which granular permissions to add based on existing role name hints
    // (This is a best-effort mapping for the migration)
    if (name === 'ops' || name === 'operations') {
      toAdd.push('salary.approve_ops', 'dashboard.default');
    } else if (name === 'compliance') {
      toAdd.push('salary.approve_compliance', 'dashboard.compliance');
    } else if (name === 'accountant' || name === 'accounts' || name === 'junior_accountant') {
      toAdd.push('salary.approve_ops', 'salary.approve_compliance', 'salary.approve_accounts', 'dashboard.default');
    } else {
      // Unknown role with salary.approve — give all stage permissions
      toAdd.push('salary.approve_ops', 'salary.approve_compliance', 'salary.approve_accounts');
    }

    const newPerms = [...new Set([...role.permissions, ...toAdd])];
    if (newPerms.length !== role.permissions.length) {
      role.permissions = newPerms;
      await role.save();
      console.log(`  Role '${role.name}': Added ${toAdd.join(', ')}`);
    }
  }

  // 3. Update roles with old attendance.approve → add granular permissions
  const rolesWithAttendanceApprove = await Role.find({
    permissions: 'attendance.approve',
    isSystemRole: { $ne: true },
  });

  for (const role of rolesWithAttendanceApprove) {
    const name = role.name?.toLowerCase();
    const toAdd = [];

    if (name === 'sales') {
      toAdd.push('attendance.approve_sales', 'dashboard.sales');
    } else if (name === 'ops' || name === 'operations') {
      toAdd.push('attendance.approve_ops');
    } else {
      // Unknown role — give both
      toAdd.push('attendance.approve_sales', 'attendance.approve_ops');
    }

    const newPerms = [...new Set([...role.permissions, ...toAdd])];
    if (newPerms.length !== role.permissions.length) {
      role.permissions = newPerms;
      await role.save();
      console.log(`  Role '${role.name}': Added ${toAdd.join(', ')}`);
    }
  }

  console.log('\n=== Migration complete ===');
}

module.exports = { run };
