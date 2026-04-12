import axiosInstance from './axiosInstance';

export const getDriverVisas = (params) =>
  axiosInstance.get('/driver-visas', { params }).then((r) => r.data);

export const getDriverVisa = (id) =>
  axiosInstance.get(`/driver-visas/${id}`).then((r) => r.data);

export const createDriverVisa = (data) =>
  axiosInstance.post('/driver-visas', data).then((r) => r.data);

export const updateDriverVisaBasics = (id, data) =>
  axiosInstance.put(`/driver-visas/${id}`, data).then((r) => r.data);

export const updateDriverVisaFinancials = (id, data) =>
  axiosInstance.put(`/driver-visas/${id}/financials`, data).then((r) => r.data);

export const addDriverVisaLineItem = (id, data) =>
  axiosInstance.post(`/driver-visas/${id}/line-items`, data).then((r) => r.data);

export const removeDriverVisaLineItem = (id, lineItemId) =>
  axiosInstance.delete(`/driver-visas/${id}/line-items/${lineItemId}`).then((r) => r.data);

export const logDriverVisaProcessing = (id, data) =>
  axiosInstance.put(`/driver-visas/${id}/processing`, data).then((r) => r.data);

export const waiveDriverVisa = (id, data) =>
  axiosInstance.put(`/driver-visas/${id}/waive`, data).then((r) => r.data);

export const cancelDriverVisa = (id, data) =>
  axiosInstance.put(`/driver-visas/${id}/cancel`, data).then((r) => r.data);
