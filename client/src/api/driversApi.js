import axiosInstance from './axiosInstance';

export const getDrivers = (params) =>
  axiosInstance.get('/drivers', { params }).then(r => r.data);

export const getDriver = (id) =>
  axiosInstance.get(`/drivers/${id}`).then(r => r.data);

export const createDriver = (data) =>
  axiosInstance.post('/drivers', data).then(r => r.data);

export const updateDriver = (id, data) =>
  axiosInstance.put(`/drivers/${id}`, data).then(r => r.data);

export const getDriverLedger = (id, params) =>
  axiosInstance.get(`/drivers/${id}/ledger`, { params }).then(r => r.data);
