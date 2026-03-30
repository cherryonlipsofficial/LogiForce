import axiosInstance from './axiosInstance';

// Legacy manual advance endpoints
export const getLegacyAdvances = (params) =>
  axiosInstance.get('/advances', { params }).then(r => r.data);

export const issueLegacyAdvance = (data) =>
  axiosInstance.post('/advances', data).then(r => r.data);

export const recoverLegacyAdvance = (id, data) =>
  axiosInstance.put(`/advances/${id}/recover`, data).then(r => r.data);

// Driver advance request workflow
export const getAdvances = (params) =>
  axiosInstance.get('/advances/driver', { params }).then(r => r.data);

export const getAdvance = (id) =>
  axiosInstance.get(`/advances/driver/${id}`).then(r => r.data);

export const requestAdvance = (data) =>
  axiosInstance.post('/advances/driver', data).then(r => r.data);

export const reviewAdvance = (id, data) =>
  axiosInstance.put(`/advances/driver/${id}/review`, data).then(r => r.data);

export const getDriverAdvances = (driverId) =>
  axiosInstance.get(`/advances/by-driver/${driverId}`).then(r => r.data);
