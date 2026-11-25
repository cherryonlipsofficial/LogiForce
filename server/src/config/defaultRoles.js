/**
 * Role definitions.
 *
 *   defaultRoles   — the roles the tenant role seed (src/scripts/seedRoles.js)
 *                    writes into a company database. Unchanged by Phase 2.
 *   ROLE_TEMPLATES — what the platform seed (src/platform/scripts/seedPlatform.js)
 *                    stores as RoleTemplates and roleSync copies into each
 *                    company: every default role without platform-scope
 *                    permissions, plus tenant_admin.
 *
 * Pure data: requiring this file must never load a Mongoose model.
 */
const { PERMISSIONS, CORE_MODULES, isPlatformPermission } = require('./permissions');

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
      'salary.view', 'salary.run',
      'salary.approve_ops', 'salary.approve_compliance', 'salary.approve_accounts',
      'salary.process', 'salary.manage_deductions', 'salary.remove_credit_note',
      'salary.adjust', 'salary.export_wps',
      'invoices.view', 'invoices.generate', 'invoices.edit',
      'invoices.download',
      'credit_notes.view', 'credit_notes.create', 'credit_notes.send',
      'credit_notes.adjust', 'credit_notes.settle', 'credit_notes.delete',
      'credit_notes.download',
      'advances.view', 'advances.approve', 'advances.manage_recovery',
      'notifications.view',
      'reports.view', 'reports.export', 'reports.financial',
      'reports.statement_of_accounts',
      'reports.ops_driver_availability', 'reports.ops_attendance_tracker',
      'reports.ops_dispute_log', 'reports.ops_assignment_history',
      'reports.ops_vehicle_utilization', 'reports.ops_vehicle_return',
      'reports.ops_onboarding_pipeline', 'reports.ops_sim_allocation',
      'reports.ops_salary_pipeline', 'reports.ops_headcount_vs_plan',
      'reports.sales_revenue_by_client', 'reports.sales_client_profitability',
      'reports.sales_credit_note_impact', 'reports.sales_contract_pipeline',
      'reports.sales_fill_rate', 'reports.sales_new_drivers',
      'reports.sales_rate_comparison',
      'reports.accounts_deduction_breakdown', 'reports.accounts_advance_schedule',
      'reports.accounts_receivables_aging', 'reports.accounts_cn_reconciliation',
      'reports.accounts_invoice_reconciliation', 'reports.accounts_fine_deductions',
      'reports.accounts_wps_reconciliation', 'reports.accounts_ledger_summary',
      'reports.accounts_sim_cost',
      'reports.finance_pnl', 'reports.finance_revenue_forecast',
      'reports.finance_cash_flow', 'reports.finance_fleet_cost',
      'reports.finance_cn_financial', 'reports.finance_supplier_payment',
      'reports.finance_outstanding',
      'settings.view',
      'users.view',
      'dashboard.default',
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
      'attendance.view', 'attendance.approve_ops',
      'attendance.dispute', 'attendance.override',
      'salary.view', 'salary.approve_ops', 'salary.manage_deductions',
      'dashboard.default',
      'invoices.view', 'invoices.download',
      'credit_notes.view', 'credit_notes.download',
      'advances.view', 'advances.request',
      'notifications.view',
      'reports.view', 'reports.export',
      'reports.ops_driver_availability', 'reports.ops_attendance_tracker',
      'reports.ops_dispute_log', 'reports.ops_assignment_history',
      'reports.ops_vehicle_utilization', 'reports.ops_vehicle_return',
      'reports.ops_onboarding_pipeline', 'reports.ops_sim_allocation',
      'reports.ops_salary_pipeline', 'reports.ops_headcount_vs_plan',
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
      'salary.view', 'salary.approve_compliance',
      'advances.view',
      'notifications.view',
      'reports.view',
      'reports.compliance_kyc_status', 'reports.compliance_status_transitions',
      'reports.compliance_headcount', 'reports.compliance_verification',
      'reports.compliance_expired_action', 'reports.compliance_sim_compliance',
      'reports.compliance_attrition',
      'dashboard.compliance',
    ],
  },
  {
    name: 'accounts',
    displayName: 'Accounts',
    description: 'Junior accounts team — reviews and approves salary deductions (stage 3)',
    isSystemRole: false,
    permissions: [
      'drivers.view', 'drivers.view_ledger',
      'clients.view',
      'projects.view',
      'suppliers.view',
      'vehicles.view',
      'attendance.view', 'attendance.respond_dispute',
      'salary.view', 'salary.approve_accounts', 'salary.manage_deductions',
      'salary.remove_credit_note', 'salary.adjust', 'salary.export_wps',
      'invoices.view', 'invoices.download',
      'credit_notes.view', 'credit_notes.download',
      'advances.view',
      'notifications.view',
      'reports.view', 'reports.export',
      'reports.ops_driver_availability', 'reports.ops_attendance_tracker',
      'reports.ops_dispute_log', 'reports.ops_assignment_history',
      'reports.ops_vehicle_utilization', 'reports.ops_salary_pipeline',
      'reports.accounts_deduction_breakdown', 'reports.accounts_advance_schedule',
      'reports.accounts_receivables_aging', 'reports.accounts_cn_reconciliation',
      'reports.accounts_invoice_reconciliation', 'reports.accounts_fine_deductions',
      'reports.accounts_wps_reconciliation', 'reports.accounts_ledger_summary',
      'reports.accounts_sim_cost',
      'settings.view',
      'dashboard.default',
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
      'attendance.view', 'attendance.approve_sales', 'attendance.dispute',
      'invoices.view', 'invoices.download',
      'credit_notes.view',
      'salary.view',
      'advances.view', 'advances.request',
      'notifications.view',
      'reports.view',
      'reports.sales_revenue_by_client', 'reports.sales_client_profitability',
      'reports.sales_credit_note_impact', 'reports.sales_contract_pipeline',
      'reports.sales_fill_rate', 'reports.sales_new_drivers',
      'reports.sales_rate_comparison',
      'dashboard.sales',
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

// ── Platform role templates ──

// Company Admin, part 1: company administration in the core modules.
const TENANT_ADMIN_CORE_PERMISSIONS = Object.freeze([
  'users.view', 'users.create', 'users.edit', 'users.delete', 'users.manage_access',
  'roles.view',
  'settings.view', 'settings.manage',
  'activity_log.view',
  'notifications.view',
  'dashboard.default',
]);

// Company Admin, part 2: every company (tenant-scope) permission outside the core
// modules, read from PERMISSIONS so new permissions are picked up automatically.
// To take something away from Company Admin, filter it out here. Each company's
// ceiling (tenantCeiling) then keeps only the modules that company has.
const TENANT_ADMIN_BUSINESS_PERMISSIONS = Object.freeze(
  Object.entries(PERMISSIONS)
    .filter(([key, p]) => !isPlatformPermission(key) && !CORE_MODULES.includes(p.module))
    .map(([key]) => key)
);

const TENANT_ADMIN_TEMPLATE = Object.freeze({
  key: 'tenant_admin',
  displayName: 'Company Admin',
  description: "Manages the company's users and settings, with full access to the company's modules",
  assignableByTenant: false,
  permissions: Object.freeze([...TENANT_ADMIN_CORE_PERMISSIONS, ...TENANT_ADMIN_BUSINESS_PERMISSIONS]),
});

// A default role as a RoleTemplate. Platform-scope permissions (roles.manage) are
// dropped: a template is copied into companies, and companies never hold them.
const templateFromRole = (role) => ({
  key: role.name,
  displayName: role.displayName,
  description: role.description,
  permissions: [...new Set(role.permissions)].filter((key) => !isPlatformPermission(key)),
  // The company admin role (the system role) is not handed out by tenants.
  assignableByTenant: role.isSystemRole !== true,
});

const ROLE_TEMPLATES = Object.freeze([
  ...defaultRoles.map(templateFromRole),
  TENANT_ADMIN_TEMPLATE,
].map((t) => Object.freeze({ ...t, permissions: Object.freeze([...t.permissions]) })));

module.exports = {
  defaultRoles,
  ROLE_TEMPLATES,
  TENANT_ADMIN_TEMPLATE,
  TENANT_ADMIN_CORE_PERMISSIONS,
  TENANT_ADMIN_BUSINESS_PERMISSIONS,
};
