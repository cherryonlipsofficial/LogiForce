// Each entry shows only for a user who holds one of `any`. The server refuses
// the pages' requests anyway; this only keeps the menu honest.
export const NAV = [
  { to: '/platform/companies', label: 'Companies', icon: '▦', any: ['platform.tenants.view'] },
  { to: '/platform/role-templates', label: 'Role templates', icon: '◈', any: ['platform.role_templates.view'] },
  { to: '/platform/users', label: 'Platform users', icon: '◍', any: ['platform.users.view'] },
  { to: '/platform/access-roles', label: 'Platform roles', icon: '◇', any: ['platform.users.view', 'platform.roles.manage'] },
  { to: '/platform/audit', label: 'Audit log', icon: '◉', any: ['platform.audit.view'] },
];
