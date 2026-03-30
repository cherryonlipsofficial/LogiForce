import axiosInstance from './axiosInstance';

export const getRuns = (params) =>
  axiosInstance.get('/salary/runs', { params }).then(r => r.data);

export const runPayroll = (data) =>
  axiosInstance.post('/salary/run', data).then(r => r.data);

export const getRun = (id) =>
  axiosInstance.get(`/salary/runs/${id}`).then(r => r.data);

export const approveRun = (id) =>
  axiosInstance.put(`/salary/runs/${id}/approve`).then(r => r.data);

export const getWpsFile = (params) =>
  axiosInstance.get('/salary/wps-file', { params, responseType: 'blob' }).then(r => r.data);

export const getPayslipPdf = (id) =>
  axiosInstance.get(`/salary/runs/${id}/payslip`, { responseType: 'blob' }).then(r => r.data);

export const addDeduction = (runId, data) =>
  axiosInstance.post(`/salary/runs/${runId}/deduction`, data).then(r => r.data);

export const deleteRun = (id, data) =>
  axiosInstance.delete(`/salary/runs/${id}`, { data }).then(r => r.data);

export const markAsPaid = (id) =>
  axiosInstance.put(`/salary/runs/${id}/pay`).then(r => r.data);

export const disputeRun = (id, reason) =>
  axiosInstance.post(`/salary/runs/${id}/dispute`, { reason }).then(r => r.data);
