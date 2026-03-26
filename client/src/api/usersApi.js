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

export const getUserPermissions = (id) =>
  axiosInstance.get(`/users/${id}/permissions`).then(r => r.data);

export const addPermissionOverride = (id, data) =>
  axiosInstance.post(`/users/${id}/permissions/override`, data).then(r => r.data);

export const removePermissionOverride = (id, key) =>
  axiosInstance.delete(`/users/${id}/permissions/override/${key}`).then(r => r.data);
