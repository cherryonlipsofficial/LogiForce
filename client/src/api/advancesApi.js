import axiosInstance from './axiosInstance';

export const getAdvances = (params) =>
  axiosInstance.get('/advances', { params }).then(r => r.data);

export const getAdvance = (id) =>
  axiosInstance.get(`/advances/${id}`).then(r => r.data);

export const requestAdvance = (data) =>
  axiosInstance.post('/advances/driver', data).then(r => r.data);

export const reviewAdvance = (id, data) =>
  axiosInstance.put(`/advances/${id}/review`, data).then(r => r.data);

export const getDriverAdvances = (driverId) =>
  axiosInstance.get(`/drivers/${driverId}/advances`).then(r => r.data);
