import axiosInstance from './axiosInstance';

export const listClearances = (params) =>
  axiosInstance.get('/driver-clearance', { params }).then(r => r.data);

export const getClearance = (id) =>
  axiosInstance.get(`/driver-clearance/${id}`).then(r => r.data);

export const logClientClearance = (id, data) =>
  axiosInstance.put(`/driver-clearance/${id}/client`, data).then(r => r.data);

export const logSupplierClearance = (id, data) =>
  axiosInstance.put(`/driver-clearance/${id}/supplier`, data).then(r => r.data);

export const logInternalClearance = (id, data) =>
  axiosInstance.put(`/driver-clearance/${id}/internal`, data).then(r => r.data);

export const addSupplierDeduction = (id, data) =>
  axiosInstance.post(`/driver-clearance/${id}/supplier/deduction`, data).then(r => r.data);

export const removeSupplierDeduction = (id, deductionId) =>
  axiosInstance.delete(`/driver-clearance/${id}/supplier/deduction/${deductionId}`).then(r => r.data);
