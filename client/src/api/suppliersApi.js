import axiosInstance from './axiosInstance';

export const getSuppliers = (params) =>
  axiosInstance.get('/suppliers', { params }).then(r => r.data);

export const createSupplier = (data) =>
  axiosInstance.post('/suppliers', data).then(r => r.data);
