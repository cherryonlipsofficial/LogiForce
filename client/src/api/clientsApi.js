import axiosInstance from './axiosInstance';

export const getClients = (params) =>
  axiosInstance.get('/clients', { params }).then(r => r.data);

export const getClient = (id) =>
  axiosInstance.get(`/clients/${id}`).then(r => r.data);

export const createClient = (data) =>
  axiosInstance.post('/clients', data).then(r => r.data);

export const updateClient = (id, data) =>
  axiosInstance.put(`/clients/${id}`, data).then(r => r.data);
