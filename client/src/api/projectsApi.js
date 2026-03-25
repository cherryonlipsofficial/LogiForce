import axiosInstance from './axiosInstance';

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

export const getProjectDrivers = (id, params) =>
  axiosInstance.get(`/projects/${id}/drivers`, { params }).then(r => r.data);

export const assignDriverToProject = (projectId, driverId) =>
  axiosInstance.post(`/projects/${projectId}/assign`, { driverId }).then(r => r.data);

export const unassignDriverFromProject = (projectId, driverId, reason) =>
  axiosInstance.post(`/projects/${projectId}/unassign`, { driverId, reason }).then(r => r.data);

export const getProjectAssignments = (id, params) =>
  axiosInstance.get(`/projects/${id}/assignments`, { params }).then(r => r.data);

// Project Contracts
export const getProjectContracts = (params) =>
  axiosInstance.get('/project-contracts', { params }).then(r => r.data);

export const createProjectContract = (data) =>
  axiosInstance.post('/project-contracts', data).then(r => r.data);

export const updateProjectContract = (id, data) =>
  axiosInstance.put(`/project-contracts/${id}`, data).then(r => r.data);

export const deleteProjectContract = (id) =>
  axiosInstance.delete(`/project-contracts/${id}`).then(r => r.data);

export const activateProjectContract = (id) =>
  axiosInstance.post(`/project-contracts/${id}/activate`).then(r => r.data);

export const terminateProjectContract = (id, reason) =>
  axiosInstance.post(`/project-contracts/${id}/terminate`, { reason }).then(r => r.data);
