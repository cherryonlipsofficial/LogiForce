import axiosInstance from './axiosInstance';

// Project CRUD
export const getProjects = (params) =>
  axiosInstance.get('/projects', { params }).then(r => r.data);

export const getProject = (id) =>
  axiosInstance.get(`/projects/${id}`).then(r => r.data);

export const createProject = (data) =>
  axiosInstance.post('/projects', data).then(r => r.data);

export const updateProject = (id, data) =>
  axiosInstance.put(`/projects/${id}`, data).then(r => r.data);

export const deleteProject = (id) =>
  axiosInstance.delete(`/projects/${id}`).then(r => r.data);

// Project drivers
export const getProjectDrivers = (id, params) =>
  axiosInstance.get(`/projects/${id}/drivers`, { params }).then(r => r.data);

export const getProjectDriverHistory = (id) =>
  axiosInstance.get(`/projects/${id}/driver-history`).then(r => r.data);

// Driver assignment
export const assignDriverToProject = (projectId, driverId, reason) =>
  axiosInstance.post(`/projects/${projectId}/assign-driver`, { driverId, reason }).then(r => r.data);

export const unassignDriverFromProject = (driverId, reason) =>
  axiosInstance.post('/projects/unassign-driver', { driverId, reason }).then(r => r.data);

// Project contracts (nested under projects)
export const getProjectContracts = (projectId) =>
  axiosInstance.get(`/projects/${projectId}/contracts`).then(r => r.data);

export const createProjectContract = (projectId, data) =>
  axiosInstance.post(`/projects/${projectId}/contracts`, data).then(r => r.data);

export const renewProjectContract = (projectId, data) =>
  axiosInstance.post(`/projects/${projectId}/contracts/renew`, data).then(r => r.data);

export const terminateProjectContract = (contractId, reason) =>
  axiosInstance.put(`/projects/contracts/${contractId}/terminate`, { reason }).then(r => r.data);

// Client-level project routes
export const getClientProjects = (clientId, params) =>
  axiosInstance.get(`/clients/${clientId}/projects`, { params }).then(r => r.data);

export const getClientProjectStats = (clientId) =>
  axiosInstance.get(`/clients/${clientId}/project-stats`).then(r => r.data);
