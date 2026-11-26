import platformAxios from './platformAxios';

const data = (r) => r.data;

// ── Auth ──
export const platformLogin = (email, password) =>
  platformAxios.post('/auth/login', { email, password }).then(data);
export const platformVerifyOtp = (challengeToken, code) =>
  platformAxios.post('/auth/verify-otp', { challengeToken, code }).then(data);
export const platformResendOtp = (challengeToken) =>
  platformAxios.post('/auth/resend-otp', { challengeToken }).then(data);
export const platformMe = () => platformAxios.get('/auth/me').then(data);
export const checkSetPasswordToken = (token) =>
  platformAxios.get(`/auth/set-password/${encodeURIComponent(token)}`).then(data);
export const setPlatformPassword = (token, password) =>
  platformAxios.post('/auth/set-password', { token, password }).then(data);

// ── Reference data ──
export const getPlatformMeta = () => platformAxios.get('/meta').then(data);

// ── Companies ──
export const listTenants = (params) => platformAxios.get('/tenants', { params }).then(data);
export const getTenant = (key) => platformAxios.get(`/tenants/${encodeURIComponent(key)}`).then(data);
export const createTenant = (body) => platformAxios.post('/tenants', body).then(data);
export const updateTenant = (key, body) =>
  platformAxios.patch(`/tenants/${encodeURIComponent(key)}`, body).then(data);
export const suspendTenant = (key, reason) =>
  platformAxios.post(`/tenants/${encodeURIComponent(key)}/suspend`, { reason }).then(data);
export const reactivateTenant = (key, reason) =>
  platformAxios.post(`/tenants/${encodeURIComponent(key)}/reactivate`, { reason }).then(data);
export const resyncTenantRoles = (key) =>
  platformAxios.post(`/tenants/${encodeURIComponent(key)}/sync-roles`).then(data);
export const resendTenantInvite = (key, email) =>
  platformAxios.post(`/tenants/${encodeURIComponent(key)}/resend-invite`, email ? { email } : {}).then(data);

// ── Role templates ──
export const listRoleTemplates = () => platformAxios.get('/role-templates').then(data);
export const updateRoleTemplate = (key, body) =>
  platformAxios.patch(`/role-templates/${encodeURIComponent(key)}`, body).then(data);

// ── Audit log ──
export const listAuditLogs = (params) => platformAxios.get('/audit-logs', { params }).then(data);
export const listAuditActions = () => platformAxios.get('/audit-logs/actions').then(data);
