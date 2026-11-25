import axiosInstance from './axiosInstance';

// Roles are read-only for companies: they are defined on the platform and
// copied in. There is no create, update, delete or duplicate.

export const getPermissionsList = () =>
  axiosInstance.get('/roles/permissions').then(r => r.data);

export const getRoles = () =>
  axiosInstance.get('/roles').then(r => r.data);

export const getRole = (id) =>
  axiosInstance.get(`/roles/${id}`).then(r => r.data);

// Roles the signed-in user may give someone (for user create/edit dropdowns).
export const getAssignableRoles = () =>
  axiosInstance.get('/roles/assignable').then(r => r.data);
