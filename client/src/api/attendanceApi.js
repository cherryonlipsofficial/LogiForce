import axiosInstance from './axiosInstance';

export const getBatches = (params) =>
  axiosInstance.get('/attendance/batches', { params }).then(r => r.data);

export const uploadFile = (formData) =>
  axiosInstance.post('/attendance/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then(r => r.data);

export const getBatch = (id) =>
  axiosInstance.get(`/attendance/batches/${id}`).then(r => r.data);

export const approveBatch = (id) =>
  axiosInstance.put(`/attendance/batches/${id}/approve`).then(r => r.data);
