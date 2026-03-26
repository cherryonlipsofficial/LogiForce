import axiosInstance from './axiosInstance';

export const getPermissionsList = () =>
  axiosInstance.get('/roles/permissions').then(r => r.data);

export const getRoles = () =>
  axiosInstance.get('/roles').then(r => r.data);

export const getRole = (id) =>
  axiosInstance.get(`/roles/${id}`).then(r => r.data);

export const createRole = (data) =>
  axiosInstance.post('/roles', data).then(r => r.data);

export const updateRole = (id, data) =>
  axiosInstance.put(`/roles/${id}`, data).then(r => r.data);

export const deleteRole = (id) =>
  axiosInstance.delete(`/roles/${id}`).then(r => r.data);

export const duplicateRole = (id, data) =>
  axiosInstance.post(`/roles/${id}/duplicate`, data).then(r => r.data);
