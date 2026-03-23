import axiosInstance from './axiosInstance';

export const getPayrollSummary = (params) =>
  axiosInstance.get('/reports/payroll-summary', { params }).then(r => r.data);

export const getInvoiceAging = (params) =>
  axiosInstance.get('/reports/invoice-aging', { params }).then(r => r.data);

export const getCostPerDriver = (params) =>
  axiosInstance.get('/reports/cost-per-driver', { params }).then(r => r.data);
