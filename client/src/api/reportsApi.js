import axiosInstance from './axiosInstance';

export const getPayrollSummary = (params) =>
  axiosInstance.get('/reports/payroll-summary', { params }).then(r => r.data);

export const getInvoiceAging = (params) =>
  axiosInstance.get('/reports/invoice-aging', { params }).then(r => r.data);

export const getCostPerDriver = (params) =>
  axiosInstance.get('/reports/cost-per-driver', { params }).then(r => r.data);

export const getFleetUtilisation = (params) =>
  axiosInstance.get('/reports/fleet-utilisation', { params }).then(r => r.data);

export const getVehicleCostPerDriver = (params) =>
  axiosInstance.get('/reports/vehicle-cost-per-driver', { params }).then(r => r.data);

export const getProjectPipeline = () =>
  axiosInstance.get('/reports/project-pipeline').then(r => r.data);
