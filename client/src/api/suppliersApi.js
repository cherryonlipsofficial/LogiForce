import axiosInstance from './axiosInstance';

export const getSuppliers = (params) =>
  axiosInstance.get('/suppliers', { params }).then(r => r.data);

export const createSupplier = (data) =>
  axiosInstance.post('/suppliers', data).then(r => r.data);

export const updateSupplier = (id, data) =>
  axiosInstance.put(`/suppliers/${id}`, data).then(r => r.data);

export const deleteSupplier = (id) =>
  axiosInstance.delete(`/suppliers/${id}`).then(r => r.data);
