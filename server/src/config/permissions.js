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

    // ── ATTENDANCE ──
    'attendance.view':         { label: 'View attendance',         module: 'Attendance', description: 'See attendance batches and records' },
    'attendance.upload':       { label: 'Upload attendance',       module: 'Attendance', description: 'Upload CSV/Excel attendance files' },
    'attendance.approve':      { label: 'Approve attendance',      module: 'Attendance', description: 'Approve attendance batches (Sales and Ops teams)' },
    'attendance.dispute':      { label: 'Raise attendance dispute', module: 'Attendance', description: 'Raise a dispute on an uploaded attendance batch' },
    'attendance.respond_dispute': { label: 'Respond to dispute',   module: 'Attendance', description: 'Respond to disputes raised on attendance (Accounts)' },
    'attendance.override':     { label: 'Override attendance',     module: 'Attendance', description: 'Override flagged attendance records' },

    // ── SALARY ──
    'salary.view':             { label: 'View salary runs',        module: 'Salary',     description: 'See salary calculations and breakdowns' },
    'salary.run':              { label: 'Run payroll',             module: 'Salary',     description: 'Trigger salary processing for a period' },
    'salary.approve':          { label: 'Approve salary',          module: 'Salary',     description: 'Approve individual or bulk salary runs' },
    'salary.adjust':           { label: 'Make salary adjustments', module: 'Salary',     description: 'Add manual adjustments to salary runs' },
    'salary.export_wps':       { label: 'Export WPS file',         module: 'Salary',     description: 'Download WPS salary transfer file' },

    // ── INVOICES ──
    'invoices.view':           { label: 'View invoices',           module: 'Invoices',   description: 'See invoice list and details' },
    'invoices.generate':       { label: 'Generate invoices',       module: 'Invoices',   description: 'Create invoices for clients' },
    'invoices.edit':           { label: 'Edit invoices',           module: 'Invoices',   description: 'Update invoice status and details' },
    'invoices.credit_note':    { label: 'Issue credit notes',      module: 'Invoices',   description: 'Create and link credit notes' },
    'invoices.download':       { label: 'Download invoice PDF',    module: 'Invoices',   description: 'Export invoices as PDF' },

    // ── ADVANCES ──
    'advances.view':           { label: 'View advances',           module: 'Advances',   description: 'See advance and loan records' },
    'advances.issue':          { label: 'Issue advances',          module: 'Advances',   description: 'Issue salary advances to drivers' },
    'advances.recover':        { label: 'Manage recovery',         module: 'Advances',   description: 'Adjust advance recovery schedules' },

    // ── REPORTS ──
    'reports.view':            { label: 'View reports',            module: 'Reports',    description: 'Access the reports section' },
    'reports.export':          { label: 'Export reports',          module: 'Reports',    description: 'Download reports as XLSX or PDF' },
    'reports.financial':       { label: 'Financial reports',       module: 'Reports',    description: 'Access P&L, cost and revenue reports' },

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
