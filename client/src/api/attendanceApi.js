import axiosInstance from './axiosInstance';

export const getBatches = (params) =>
  axiosInstance.get('/attendance/batches', { params }).then(r => r.data);

export const uploadFile = (formData) =>
  axiosInstance.post('/attendance/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then(r => r.data);

export const getBatch = (id) =>
  axiosInstance.get(`/attendance/batches/${id}`).then(r => r.data);

export const approveBatch = (id, notes) =>
  axiosInstance.post(`/attendance/batches/${id}/approve`, { notes }).then(r => r.data);

export const rejectBatch = (id) =>
  axiosInstance.put(`/attendance/batches/${id}/reject`).then(r => r.data);

export const deleteBatch = (id) =>
  axiosInstance.delete(`/attendance/batches/${id}`).then(r => r.data);

export const raiseBatchDispute = (batchId, data) =>
  axiosInstance.post(`/attendance/batches/${batchId}/dispute`, data).then(r => r.data);

export const getBatchApprovals = (batchId) =>
  axiosInstance.get(`/attendance/batches/${batchId}/approvals`);

export const getBatchDisputes = (batchId) =>
  axiosInstance.get(`/attendance/batches/${batchId}/disputes`);

export const respondToDispute = (disputeId, message) =>
  axiosInstance.post(`/attendance/disputes/${disputeId}/respond`, { message }).then(r => r.data);

export const generateInvoice = (batchId) =>
  axiosInstance.post(`/attendance/batches/${batchId}/generate-invoice`).then(r => r.data);

export const runSalary = (batchId) =>
  axiosInstance.post(`/attendance/batches/${batchId}/run-salary`).then(r => r.data);

export const getSalaryRuns = (batchId) =>
  axiosInstance.get(`/attendance/batches/${batchId}/salary-runs`).then(r => r.data);
