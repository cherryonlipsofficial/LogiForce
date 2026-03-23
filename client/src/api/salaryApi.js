import axiosInstance from './axiosInstance';

export const runPayroll = (data) =>
  axiosInstance.post('/salary/run', data).then(r => r.data);

export const getRuns = (params) =>
  axiosInstance.get('/salary', { params }).then(r => r.data);

export const getRun = (id) =>
  axiosInstance.get(`/salary/${id}`).then(r => r.data);

export const approveRun = (id) =>
  axiosInstance.post(`/salary/${id}/approve`).then(r => r.data);

export const getWpsFile = (id) =>
  axiosInstance.get(`/salary/${id}/wps`, { responseType: 'blob' }).then(r => r.data);
