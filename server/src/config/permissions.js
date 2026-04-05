module.exports = {

  PERMISSIONS: {

    // ── DRIVERS ──
    'drivers.view':            { label: 'View drivers',            module: 'Drivers',    description: 'See driver list and profiles' },
    'drivers.create':          { label: 'Add new drivers',         module: 'Drivers',    description: 'Create new driver records' },
    'drivers.edit':            { label: 'Edit driver details',     module: 'Drivers',    description: 'Update driver profile fields' },
    'drivers.edit_active':     { label: 'Edit active drivers',     module: 'Drivers',    description: 'Edit driver details when driver status is Active (e.g. upload renewed documents)' },
    'drivers.delete':          { label: 'Delete / offboard',       module: 'Drivers',    description: 'Offboard or delete driver records' },
    'drivers.view_ledger':     { label: 'View driver ledger',      module: 'Drivers',    description: 'See full financial ledger per driver' },
    'drivers.manage_docs':     { label: 'Manage documents',        module: 'Drivers',    description: 'Upload and verify driver documents' },
    'drivers.change_status':   { label: 'Change driver status',    module: 'Drivers',    description: 'Suspend, activate, put on leave' },
    'drivers.activate':        { label: 'Activate driver',          module: 'Drivers',    description: 'Activate a driver from Pending Verify status' },
    'drivers.update_client_id': { label: 'Update Client User ID',   module: 'Drivers',    description: 'Set or update the Client User ID on active drivers' },
    'drivers.manage_passport': { label: 'Manage passport submission', module: 'Drivers', description: 'Record passport submission, guarantee passports, request extensions' },

    // ── COMPLIANCE ──
    'guarantee_passports.view':  { label: 'View guarantee passports',  module: 'Compliance', description: 'View all guarantee passports and their status' },
    'expired_documents.view':    { label: 'View expired documents',    module: 'Compliance', description: 'View drivers with expired documents across all document types' },

    // ── CLIENTS ──
    'clients.view':            { label: 'View clients',            module: 'Clients',    description: 'See client list and details' },
    'clients.create':          { label: 'Add new clients',         module: 'Clients',    description: 'Create new client accounts' },
    'clients.edit':            { label: 'Edit client details',     module: 'Clients',    description: 'Update client information and rates' },
    'clients.delete':          { label: 'Delete clients',          module: 'Clients',    description: 'Remove client accounts' },

    // ── PROJECTS ──
    'projects.view':           { label: 'View projects',           module: 'Projects',   description: 'See project list and details' },
    'projects.create':         { label: 'Create projects',         module: 'Projects',   description: 'Add new projects under clients' },
    'projects.edit':           { label: 'Edit projects',           module: 'Projects',   description: 'Update project details and rates' },
    'projects.delete':         { label: 'Delete projects',         module: 'Projects',   description: 'Remove projects' },
    'projects.manage_contracts': { label: 'Manage project contracts', module: 'Projects', description: 'Create, renew, terminate project contracts' },
    'projects.assign_drivers': { label: 'Assign drivers to projects', module: 'Projects', description: 'Move drivers between projects' },

    // ── SUPPLIERS ──
    'suppliers.view':          { label: 'View suppliers',          module: 'Suppliers',  description: 'See supplier list and details' },
    'suppliers.create':        { label: 'Add suppliers',           module: 'Suppliers',  description: 'Create new supplier accounts' },
    'suppliers.edit':          { label: 'Edit suppliers',          module: 'Suppliers',  description: 'Update supplier information' },
    'suppliers.delete':        { label: 'Delete suppliers',        module: 'Suppliers',  description: 'Remove supplier accounts' },

    // ── VEHICLES ──
    'vehicles.view':           { label: 'View vehicles',           module: 'Vehicles',   description: 'See fleet list and vehicle details' },
    'vehicles.create':         { label: 'Add vehicles',            module: 'Vehicles',   description: 'Add vehicles to the fleet' },
    'vehicles.edit':           { label: 'Edit vehicle details',    module: 'Vehicles',   description: 'Update vehicle information' },
    'vehicles.assign':         { label: 'Assign vehicles',         module: 'Vehicles',   description: 'Assign and return vehicles to/from drivers' },
    'vehicles.off_hire':       { label: 'Off-hire vehicles',       module: 'Vehicles',   description: 'Off-hire and terminate vehicle contracts' },
    'vehicles.manage_contracts': { label: 'Manage vehicle contracts', module: 'Vehicles', description: 'Create, renew, terminate vehicle lease contracts' },
    'vehicles.manage_catalog': { label: 'Manage vehicle catalog',  module: 'Vehicles',   description: 'Add/edit vehicle categories per supplier' },
    'vehicles.manage_fines':   { label: 'Manage vehicle fines',    module: 'Vehicles',   description: 'Add, edit, waive traffic fines and salik charges' },
    'vehicles.view_fines':     { label: 'View vehicle fines',      module: 'Vehicles',   description: 'View fines and salik history for vehicles' },
    'vehicles.view_timeline':  { label: 'View vehicle timeline',   module: 'Vehicles',   description: 'View full assignment timeline of a vehicle' },
    'vehicles.fleet_dashboard': { label: 'Fleet dashboard',        module: 'Vehicles',   description: 'Access the fleet management dashboard with KPIs' },

    // ── ATTENDANCE ──
    'attendance.view':         { label: 'View attendance',         module: 'Attendance', description: 'See attendance batches and records' },
    'attendance.upload':       { label: 'Upload attendance',       module: 'Attendance', description: 'Upload CSV/Excel attendance files' },
    'attendance.approve':      { label: 'Approve attendance (legacy)', module: 'Attendance', description: '@deprecated — use attendance.approve_sales / attendance.approve_ops instead' },
    'attendance.approve_sales': { label: 'Approve attendance (sales)', module: 'Attendance', description: 'Sales team attendance approval' },
    'attendance.approve_ops':  { label: 'Approve attendance (ops)', module: 'Attendance', description: 'Operations team attendance approval' },
    'attendance.reject':       { label: 'Reject attendance',       module: 'Attendance', description: 'Reject attendance batches' },
    'attendance.dispute':      { label: 'Raise attendance dispute', module: 'Attendance', description: 'Raise a dispute on an uploaded attendance batch' },
    'attendance.respond_dispute': { label: 'Respond to dispute',   module: 'Attendance', description: 'Respond to disputes raised on attendance (Accounts)' },
    'attendance.override':     { label: 'Override attendance',     module: 'Attendance', description: 'Override flagged attendance records' },
    'attendance.delete':       { label: 'Delete attendance batch', module: 'Attendance', description: 'Delete attendance batches and their records' },

    // ── SALARY ──
    'salary.view':             { label: 'View salary runs',        module: 'Salary',     description: 'See salary calculations and breakdowns' },
    'salary.run':              { label: 'Run payroll',             module: 'Salary',     description: 'Trigger salary processing for a period' },
    'salary.approve_ops':      { label: 'Approve salary (stage 1)', module: 'Salary',    description: 'First-stage approval of salary runs — add deductions and approve' },
    'salary.approve_compliance': { label: 'Approve salary (stage 2)', module: 'Salary',  description: 'Second-stage approval — verify driver document validity' },
    'salary.approve_accounts': { label: 'Approve salary (stage 3)', module: 'Salary',    description: 'Third-stage approval — final deduction review' },
    'salary.process':          { label: 'Process salary',          module: 'Salary',     description: 'Process salary after all approvals received' },
    'salary.adjust':           { label: 'Make salary adjustments', module: 'Salary',     description: 'Add manual adjustments to salary runs' },
    'salary.export_wps':       { label: 'Export WPS file',         module: 'Salary',     description: 'Download WPS salary transfer file' },
    'salary.view_payslip':     { label: 'View & download payslips', module: 'Salary',    description: 'Generate, view and download payslip PDFs' },
    'salary.delete':           { label: 'Delete salary runs',      module: 'Salary',     description: 'Delete salary runs in draft or approved status' },
    'salary.manage_deductions': { label: 'Manage deductions',      module: 'Salary',     description: 'Manually add or edit salary deductions (telecom, vehicle, salik, advance, penalty, carryover, other)' },
    'salary.pay':              { label: 'Mark salary as paid',     module: 'Salary',     description: 'Mark approved salary runs as paid' },
    'salary.dispute':          { label: 'Dispute salary',          module: 'Salary',     description: 'Raise a dispute on a salary run' },

    // ── INVOICES ──
    'invoices.view':           { label: 'View invoices',           module: 'Invoices',   description: 'See invoice list and details' },
    'invoices.generate':       { label: 'Generate invoices',       module: 'Invoices',   description: 'Create invoices for clients' },
    'invoices.edit':           { label: 'Edit invoices',           module: 'Invoices',   description: 'Update invoice status and details' },
    'invoices.delete':         { label: 'Delete invoices',         module: 'Invoices',   description: 'Permanently delete invoices' },
    'invoices.download':       { label: 'Download invoice PDF',    module: 'Invoices',   description: 'Export invoices as PDF' },

    // ── CREDIT NOTES ──
    'credit_notes.view':        { label: 'View credit notes',       module: 'Credit Notes', description: 'See credit note list and details' },
    'credit_notes.create':      { label: 'Create credit notes',     module: 'Credit Notes', description: 'Generate new credit notes with driver line items' },
    'credit_notes.send':        { label: 'Send credit notes',       module: 'Credit Notes', description: 'Mark credit notes as sent to client' },
    'credit_notes.adjust':      { label: 'Adjust credit notes',     module: 'Credit Notes', description: 'Link credit notes to invoices when client confirms deduction' },
    'credit_notes.settle':      { label: 'Settle credit notes',     module: 'Credit Notes', description: 'Manually resolve credit note lines for resigned drivers' },
    'credit_notes.delete':      { label: 'Delete credit notes',     module: 'Credit Notes', description: 'Delete draft credit notes' },
    'credit_notes.download':    { label: 'Download CN PDF',         module: 'Credit Notes', description: 'Generate and download credit note PDFs' },

    // ── DRIVER RECEIVABLES ──
    'receivables.view':          { label: 'View receivables',          module: 'Receivables', description: 'View driver receivables from credit notes' },
    'receivables.recover':       { label: 'Record recovery',           module: 'Receivables', description: 'Record cash/bank recovery against driver receivables' },
    'receivables.write_off':     { label: 'Write off receivables',     module: 'Receivables', description: 'Write off unrecoverable driver receivable balances' },

    // ── ADVANCES ──
    'advances.view':           { label: 'View advances',           module: 'Advances',   description: 'View driver advance requests and history' },
    'advances.request':        { label: 'Request advance',         module: 'Advances',   description: 'Submit advance requests for drivers (Sales and Operations)' },
    'advances.approve':        { label: 'Approve or reject advances', module: 'Advances', description: 'Review advance requests and set recovery schedule (Accounts)' },
    'advances.manage_recovery': { label: 'Manage recovery schedule', module: 'Advances',  description: 'Edit advance recovery installments' },

    // ── NOTIFICATIONS ──
    'notifications.view':     { label: 'View notifications',      module: 'Notifications', description: 'Receive and view in-app notifications' },

    // ── REPORTS ──
    'reports.view':            { label: 'View reports',            module: 'Reports',    description: 'Access the reports section' },
    'reports.export':          { label: 'Export reports',          module: 'Reports',    description: 'Download reports as XLSX or PDF' },
    'reports.financial':       { label: 'Financial reports',       module: 'Reports',    description: 'Access P&L, cost and revenue reports' },
    'reports.statement_of_accounts': { label: 'Statement of accounts', module: 'Reports', description: 'View statement of accounts per project with invoices, credit notes, and payments' },

    // Operations Reports
    'reports.ops_driver_availability':     { label: 'Driver availability report',        module: 'Reports', description: 'View daily driver availability by status per project' },
    'reports.ops_attendance_tracker':      { label: 'Attendance approval tracker',        module: 'Reports', description: 'View attendance batch approval pipeline status' },
    'reports.ops_dispute_log':             { label: 'Attendance dispute log',             module: 'Reports', description: 'View attendance dispute history and turnaround times' },
    'reports.ops_assignment_history':      { label: 'Driver assignment history',          module: 'Reports', description: 'View driver-to-project assignment history' },
    'reports.ops_vehicle_utilization':     { label: 'Vehicle utilization report',         module: 'Reports', description: 'View vehicle assignment status and idle tracking' },
    'reports.ops_vehicle_return':          { label: 'Vehicle return condition report',    module: 'Reports', description: 'View vehicle return conditions and damage trends' },
    'reports.ops_onboarding_pipeline':     { label: 'Driver onboarding pipeline',         module: 'Reports', description: 'View driver onboarding stages and bottlenecks' },
    'reports.ops_sim_allocation':          { label: 'SIM card allocation report',         module: 'Reports', description: 'View SIM card assignments and unallocated SIMs' },
    'reports.ops_salary_pipeline':         { label: 'Salary approval pipeline',           module: 'Reports', description: 'View salary run approval stage tracking' },
    'reports.ops_headcount_vs_plan':       { label: 'Project headcount vs plan',          module: 'Reports', description: 'View actual vs planned driver count per project' },

    // Sales Reports
    'reports.sales_revenue_by_client':     { label: 'Revenue by client',                  module: 'Reports', description: 'View invoiced revenue per client with trends' },
    'reports.sales_client_profitability':  { label: 'Client profitability analysis',      module: 'Reports', description: 'View revenue minus cost per client (gross margin)' },
    'reports.sales_credit_note_impact':    { label: 'Credit note impact report',          module: 'Reports', description: 'View credit note amounts and impact on revenue per client' },
    'reports.sales_contract_pipeline':     { label: 'Contract expiry & renewal pipeline', module: 'Reports', description: 'View contracts expiring in 30/60/90 days' },
    'reports.sales_fill_rate':             { label: 'Driver fill rate by project',        module: 'Reports', description: 'View active vs planned headcount fill rate' },
    'reports.sales_new_drivers':           { label: 'New driver additions report',        module: 'Reports', description: 'View drivers added per client/project per period' },
    'reports.sales_rate_comparison':       { label: 'Client rate comparison',             module: 'Reports', description: 'View rate per driver across projects per client' },

    // ── DASHBOARD ──
    'dashboard.default':       { label: 'Default dashboard',       module: 'Dashboard',  description: 'Access the default admin/ops dashboard view' },
    'dashboard.compliance':    { label: 'Compliance dashboard',    module: 'Dashboard',  description: 'Access the compliance-focused dashboard view' },
    'dashboard.sales':         { label: 'Sales dashboard',         module: 'Dashboard',  description: 'Access the sales-focused dashboard view' },

    // ── SIM CARDS ──
    'simcards.view':           { label: 'View SIM cards',          module: 'SIM Cards', description: 'View SIM card list and details' },
    'simcards.create':         { label: 'Add SIM cards',           module: 'SIM Cards', description: 'Add new SIM cards' },
    'simcards.edit':           { label: 'Edit SIM cards',          module: 'SIM Cards', description: 'Edit SIM card details' },
    'simcards.assign':         { label: 'Assign SIM cards',        module: 'SIM Cards', description: 'Assign and return SIM cards to/from drivers' },
    'simcards.import_bills':   { label: 'Import SIM bills',        module: 'SIM Cards', description: 'Bulk import monthly telecom bills' },
    'simcards.manage_bills':   { label: 'Manage SIM bills',        module: 'SIM Cards', description: 'Edit bill allocations and waive charges' },

    // ── SETTINGS ──
    'settings.view':           { label: 'View settings',           module: 'Settings',   description: 'Access system settings' },
    'settings.manage':         { label: 'Manage system settings',  module: 'Settings',   description: 'Change deduction rules, allowances, constants' },
    'users.view':              { label: 'View users',              module: 'Users',      description: 'See user accounts' },
    'users.create':            { label: 'Create users',            module: 'Users',      description: 'Add new user accounts' },
    'users.edit':              { label: 'Edit users',              module: 'Users',      description: 'Update user details and roles' },
    'users.delete':            { label: 'Delete users',            module: 'Users',      description: 'Remove user accounts' },
    'roles.manage':            { label: 'Manage roles & permissions', module: 'Users',   description: 'Create roles and configure permissions — super admin only' },
  },

};

// Legacy permission keys that were renamed — map old → new
module.exports.LEGACY_KEY_MAP = {
  'advances.issue':        'advances.approve',
  'advances.recover':      'advances.manage_recovery',
  'invoices.credit_note':  'credit_notes.view',
};

// Standalone helpers — safe to destructure (no `this` dependency)
module.exports.getByModule = () => {
  const grouped = {};
  for (const [key, val] of Object.entries(module.exports.PERMISSIONS)) {
    if (!grouped[val.module]) grouped[val.module] = [];
    grouped[val.module].push({ key, ...val });
  }
  return grouped;
};

module.exports.getAllKeys = () => {
  return Object.keys(module.exports.PERMISSIONS);
};

// Replace legacy permission keys with their current equivalents
module.exports.migrateLegacyKeys = (keys) => {
  const map = module.exports.LEGACY_KEY_MAP;
  const migrated = keys.map(k => map[k] || k);
  return [...new Set(migrated)];
};
