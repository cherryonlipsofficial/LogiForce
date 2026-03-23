import axiosInstance from './axiosInstance';

export const getClients = (params) =>
  axiosInstance.get('/clients', { params }).then(r => r.data);

export const getClient = (id) =>
  axiosInstance.get(`/clients/${id}`).then(r => r.data);

export const createClient = (data) =>
  axiosInstance.post('/clients', data).then(r => r.data);

export const updateClient = (id, data) =>
  axiosInstance.put(`/clients/${id}`, data).then(r => r.data);

export const deleteClient = (id) =>
  axiosInstance.delete(`/clients/${id}`).then(r => r.data);

export const uploadContract = (id, file) => {
  const formData = new FormData();
  formData.append('file', file);
  return axiosInstance.post(`/clients/${id}/contract`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then(r => r.data);
};

export const deleteContract = (id) =>
  axiosInstance.delete(`/clients/${id}/contract`).then(r => r.data);

export const getContractUrl = (id, download = false) => {
  const base = axiosInstance.defaults.baseURL;
  return `${base}/clients/${id}/contract${download ? '?download=true' : ''}`;
};
