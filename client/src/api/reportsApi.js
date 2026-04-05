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

// ── Operations Reports ──
export const getOpsDriverAvailability = (params) =>
  axiosInstance.get('/reports/ops/driver-availability', { params }).then(r => r.data);

export const getOpsAttendanceTracker = (params) =>
  axiosInstance.get('/reports/ops/attendance-tracker', { params }).then(r => r.data);

export const getOpsDisputeLog = (params) =>
  axiosInstance.get('/reports/ops/dispute-log', { params }).then(r => r.data);

export const getOpsAssignmentHistory = (params) =>
  axiosInstance.get('/reports/ops/assignment-history', { params }).then(r => r.data);

export const getOpsVehicleUtilization = (params) =>
  axiosInstance.get('/reports/ops/vehicle-utilization', { params }).then(r => r.data);

export const getOpsVehicleReturn = (params) =>
  axiosInstance.get('/reports/ops/vehicle-return', { params }).then(r => r.data);

export const getOpsOnboardingPipeline = () =>
  axiosInstance.get('/reports/ops/onboarding-pipeline').then(r => r.data);

export const getOpsSimAllocation = () =>
  axiosInstance.get('/reports/ops/sim-allocation').then(r => r.data);

export const getOpsSalaryPipeline = (params) =>
  axiosInstance.get('/reports/ops/salary-pipeline', { params }).then(r => r.data);

export const getOpsHeadcountVsPlan = () =>
  axiosInstance.get('/reports/ops/headcount-vs-plan').then(r => r.data);

// ── Sales Reports ──
export const getSalesRevenueByClient = (params) =>
  axiosInstance.get('/reports/sales/revenue-by-client', { params }).then(r => r.data);

export const getSalesClientProfitability = (params) =>
  axiosInstance.get('/reports/sales/client-profitability', { params }).then(r => r.data);

export const getSalesCreditNoteImpact = (params) =>
  axiosInstance.get('/reports/sales/credit-note-impact', { params }).then(r => r.data);

export const getSalesContractPipeline = () =>
  axiosInstance.get('/reports/sales/contract-pipeline').then(r => r.data);

export const getSalesFillRate = () =>
  axiosInstance.get('/reports/sales/fill-rate').then(r => r.data);

export const getSalesNewDrivers = (params) =>
  axiosInstance.get('/reports/sales/new-drivers', { params }).then(r => r.data);

export const getSalesRateComparison = () =>
  axiosInstance.get('/reports/sales/rate-comparison').then(r => r.data);
