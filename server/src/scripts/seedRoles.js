const Role = require('../models/Role');
const { PERMISSIONS } = require('../config/permissions');

const allKeys = Object.keys(PERMISSIONS);

const defaultRoles = [
  {
    name: 'admin',
    displayName: 'Administrator',
    description: 'Full access to all modules',
    isSystemRole: true,
    permissions: allKeys, // admin gets everything
  },
  {
    name: 'accountant',
    displayName: 'Accountant',
    description: 'Finance and payroll access, read-only on operations',
    isSystemRole: false,
    permissions: [
      'drivers.view', 'drivers.view_ledger',
      'clients.view',
      'projects.view',
      'suppliers.view',
      'vehicles.view',
      'attendance.view', 'attendance.upload', 'attendance.respond_dispute',
      'salary.view', 'salary.run', 'salary.approve',
      'salary.process',
      'salary.adjust', 'salary.export_wps',
      'invoices.view', 'invoices.generate', 'invoices.edit',
      'invoices.credit_note', 'invoices.download',
      'advances.view', 'advances.approve', 'advances.manage_recovery',
      'notifications.view',
      'reports.view', 'reports.export', 'reports.financial',
      'settings.view',
      'users.view',
    ],
  },
  {
    name: 'ops',
    displayName: 'Operations',
    description: 'Operations team — manages fleet, projects, attendance and driver activation',
    isSystemRole: false,
    permissions: [
      'drivers.view', 'drivers.create', 'drivers.edit',
      'drivers.manage_docs', 'drivers.change_status', 'drivers.manage_passport',
      'clients.view', 'clients.create', 'clients.edit',
      'projects.view', 'projects.create', 'projects.edit',
      'projects.assign_drivers',
      'suppliers.view',
      'vehicles.view', 'vehicles.create', 'vehicles.edit',
      'vehicles.assign', 'vehicles.manage_catalog',
      'attendance.view', 'attendance.approve',
      'attendance.dispute', 'attendance.override',
      'salary.view', 'salary.approve', 'salary.manage_deductions',
      'invoices.view', 'invoices.download',
      'advances.view', 'advances.request',
      'notifications.view',
      'reports.view', 'reports.export',
      'settings.view',
    ],
  },
  {
    name: 'compliance',
    displayName: 'Compliance',
    description: 'Compliance team — manages driver documents, KYC and contact verification',
    isSystemRole: false,
    permissions: [
      'drivers.view', 'drivers.create', 'drivers.edit', 'drivers.edit_active',
      'drivers.manage_docs', 'drivers.change_status', 'drivers.manage_passport',
      'clients.view',
      'projects.view', 'projects.assign_drivers',
      'suppliers.view',
      'vehicles.view',
      'attendance.view',
      'salary.view', 'salary.approve',
      'advances.view',
      'notifications.view',
      'reports.view',
    ],
  },
  {
    name: 'sales',
    displayName: 'Sales',
    description: 'Sales team — can add new drivers (Draft status only)',
    isSystemRole: false,
    permissions: [
      'drivers.view',
      'drivers.create',
      'clients.view',
      'projects.view',
      'attendance.view', 'attendance.approve', 'attendance.dispute',
      'invoices.view', 'invoices.download',
      'salary.view',
      'advances.view', 'advances.request',
      'notifications.view',
      'reports.view',
    ],
  },
  {
    name: 'junior_accountant',
    displayName: 'Junior Accountant',
    description: 'Junior accounts team — reviews and approves salary after compliance, manages deductions',
    isSystemRole: false,
    permissions: [
      'drivers.view', 'drivers.view_ledger',
      'clients.view',
      'projects.view',
      'suppliers.view',
      'vehicles.view',
      'attendance.view',
      'salary.view', 'salary.approve', 'salary.manage_deductions', 'salary.adjust',
      'invoices.view', 'invoices.download',
      'advances.view',
      'notifications.view',
      'reports.view', 'reports.export',
      'settings.view',
      'users.view',
    ],
  },
  {
    name: 'viewer',
    displayName: 'Read-Only Viewer',
    description: 'View-only access to all non-financial modules',
    isSystemRole: false,
    permissions: [
      'drivers.view',
      'clients.view',
      'projects.view',
      'suppliers.view',
      'vehicles.view',
      'attendance.view',
      'salary.view',
      'invoices.view',
      'advances.view',
      'notifications.view',
      'reports.view',
    ],
  },
];

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
