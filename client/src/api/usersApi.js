import axiosInstance from './axiosInstance';

export const getUsers = (params) =>
  axiosInstance.get('/users', { params }).then(r => r.data);

export const getUser = (id) =>
  axiosInstance.get(`/users/${id}`).then(r => r.data);

export const createUser = (data) =>
  axiosInstance.post('/users', data).then(r => r.data);

export const updateUser = (id, data) =>
  axiosInstance.put(`/users/${id}`, data).then(r => r.data);

export const deleteUser = (id) =>
  axiosInstance.delete(`/users/${id}`).then(r => r.data);

export const changeUserRole = (id, roleId) =>
  axiosInstance.put(`/users/${id}/role`, { roleId }).then(r => r.data);

// Permissions the signed-in user may grant someone: within the company's
// enabled modules and held by the signed-in user. The server refuses others.
export const getGrantablePermissions = () =>
  axiosInstance.get('/users/grantable-permissions').then(r => r.data);

export const getUserPermissions = (id) =>
  axiosInstance.get(`/users/${id}/permissions`).then(r => r.data);

export const addPermissionOverride = (id, data) =>
  axiosInstance.post(`/users/${id}/permissions/override`, data).then(r => r.data);

export const removePermissionOverride = (id, key) =>
  axiosInstance.delete(`/users/${id}/permissions/override/${key}`).then(r => r.data);

export const activateUser = (id) =>
  axiosInstance.put(`/users/${id}/activate`);

export const deactivateUser = (id) =>
  axiosInstance.put(`/users/${id}/deactivate`);

export const getInactiveUsers = () =>
  axiosInstance.get('/users/inactive');

export const sendPasswordResetEmail = (id) =>
  axiosInstance.post(`/users/${id}/reset-password`).then(r => r.data);
