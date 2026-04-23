import axiosInstance from './axiosInstance';

// ── Financial Reports ──
export const getPayrollSummary = (params) =>
  axiosInstance.get('/reports/payroll-summary', { params }).then(r => r.data);

export const getInvoiceAging = (params) =>
  axiosInstance.get('/reports/invoice-aging', { params }).then(r => r.data);

export const getCostPerDriver = (params) =>
  axiosInstance.get('/reports/cost-per-driver', { params }).then(r => r.data);

export const getAdvanceOutstanding = (params) =>
  axiosInstance.get('/reports/advance-outstanding', { params }).then(r => r.data);

export const getVehicleCostPerDriver = (params) =>
  axiosInstance.get('/reports/vehicle-cost-per-driver', { params }).then(r => r.data);

export const getStatementOfAccounts = (params) =>
  axiosInstance.get('/reports/statement-of-accounts', { params }).then(r => r.data);

// ── Core Reports ──
export const getProjectPipeline = () =>
  axiosInstance.get('/reports/project-pipeline').then(r => r.data);

export const getDocumentExpiry = (params) =>
  axiosInstance.get('/reports/document-expiry', { params }).then(r => r.data);

export const getFleetUtilisation = (params) =>
  axiosInstance.get('/reports/fleet-utilisation', { params }).then(r => r.data);

export const getAlertCount = (params) =>
  axiosInstance.get('/reports/alert-count', { params }).then(r => r.data);

// ── Operations Reports (ops/ prefix) ──
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

// ── Sales Reports (sales/ prefix) ──
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

// ── Operations Reports (non-prefixed) ──
export const getDriverAvailability = (params) =>
  axiosInstance.get('/reports/driver-availability', { params }).then(r => r.data);

export const getAttendanceTracker = (params) =>
  axiosInstance.get('/reports/attendance-tracker', { params }).then(r => r.data);

export const getDisputeLog = (params) =>
  axiosInstance.get('/reports/dispute-log', { params }).then(r => r.data);

export const getAssignmentHistory = (params) =>
  axiosInstance.get('/reports/assignment-history', { params }).then(r => r.data);

export const getVehicleReturnCondition = (params) =>
  axiosInstance.get('/reports/vehicle-return-condition', { params }).then(r => r.data);

export const getOnboardingPipeline = (params) =>
  axiosInstance.get('/reports/onboarding-pipeline', { params }).then(r => r.data);

export const getSimAllocation = (params) =>
  axiosInstance.get('/reports/sim-allocation', { params }).then(r => r.data);

export const getSalaryPipeline = (params) =>
  axiosInstance.get('/reports/salary-pipeline', { params }).then(r => r.data);

export const getHeadcountVsPlan = (params) =>
  axiosInstance.get('/reports/headcount-vs-plan', { params }).then(r => r.data);

// ── Sales Reports (non-prefixed) ──
export const getRevenueByClient = (params) =>
  axiosInstance.get('/reports/revenue-by-client', { params }).then(r => r.data);

export const getClientProfitability = (params) =>
  axiosInstance.get('/reports/client-profitability', { params }).then(r => r.data);

export const getCreditNoteImpact = (params) =>
  axiosInstance.get('/reports/credit-note-impact', { params }).then(r => r.data);

export const getContractPipeline = (params) =>
  axiosInstance.get('/reports/contract-pipeline', { params }).then(r => r.data);

export const getFillRate = (params) =>
  axiosInstance.get('/reports/fill-rate', { params }).then(r => r.data);

export const getNewDrivers = (params) =>
  axiosInstance.get('/reports/new-drivers', { params }).then(r => r.data);

export const getRateComparison = (params) =>
  axiosInstance.get('/reports/rate-comparison', { params }).then(r => r.data);

// ── Compliance Reports ──
export const getKycCompliance = (params) =>
  axiosInstance.get('/reports/kyc-compliance', { params }).then(r => r.data);

export const getStatusTransitions = (params) =>
  axiosInstance.get('/reports/status-transitions', { params }).then(r => r.data);

export const getWorkforceHeadcount = (params) =>
  axiosInstance.get('/reports/workforce-headcount', { params }).then(r => r.data);

export const getVerificationAudit = (params) =>
  axiosInstance.get('/reports/verification-audit', { params }).then(r => r.data);

export const getExpiredDocViolations = (params) =>
  axiosInstance.get('/reports/expired-doc-violations', { params }).then(r => r.data);

export const getSimCompliance = (params) =>
  axiosInstance.get('/reports/sim-compliance', { params }).then(r => r.data);

export const getAttritionTenure = (params) =>
  axiosInstance.get('/reports/attrition-tenure', { params }).then(r => r.data);

// ── Accounts Reports ──
export const getDeductionBreakdown = (params) =>
  axiosInstance.get('/reports/deduction-breakdown', { params }).then(r => r.data);

export const getAdvanceSchedule = (params) =>
  axiosInstance.get('/reports/advance-schedule', { params }).then(r => r.data);

export const getReceivablesAging = (params) =>
  axiosInstance.get('/reports/receivables-aging', { params }).then(r => r.data);

export const getCnReconciliation = (params) =>
  axiosInstance.get('/reports/cn-reconciliation', { params }).then(r => r.data);

export const getInvoiceReconciliation = (params) =>
  axiosInstance.get('/reports/invoice-reconciliation', { params }).then(r => r.data);

export const getFineDeductions = (params) =>
  axiosInstance.get('/reports/fine-deductions', { params }).then(r => r.data);

export const getWpsReconciliation = (params) =>
  axiosInstance.get('/reports/wps-reconciliation', { params }).then(r => r.data);

export const getLedgerSummary = (params) =>
  axiosInstance.get('/reports/ledger-summary', { params }).then(r => r.data);

export const getSimCost = (params) =>
  axiosInstance.get('/reports/sim-cost', { params }).then(r => r.data);

// ── Finance Reports ──
export const getProfitLoss = (params) =>
  axiosInstance.get('/reports/profit-loss', { params }).then(r => r.data);

export const getRevenueForecast = (params) =>
  axiosInstance.get('/reports/revenue-forecast', { params }).then(r => r.data);

export const getCashFlow = (params) =>
  axiosInstance.get('/reports/cash-flow', { params }).then(r => r.data);

export const getFleetCost = (params) =>
  axiosInstance.get('/reports/fleet-cost', { params }).then(r => r.data);

export const getCnFinancialImpact = (params) =>
  axiosInstance.get('/reports/cn-financial-impact', { params }).then(r => r.data);

export const getSupplierPayment = (params) =>
  axiosInstance.get('/reports/supplier-payment', { params }).then(r => r.data);

export const getOutstandingReceivables = (params) =>
  axiosInstance.get('/reports/outstanding-receivables', { params }).then(r => r.data);

// ── Admin / System Reports ──
export const getAuditTrail = (params) =>
  axiosInstance.get('/reports/audit-trail', { params }).then(r => r.data);

export const getUserActivity = (params) =>
  axiosInstance.get('/reports/user-activity', { params }).then(r => r.data);

export const getRoleMatrix = (params) =>
  axiosInstance.get('/reports/role-matrix', { params }).then(r => r.data);

export const getDataQuality = (params) =>
  axiosInstance.get('/reports/data-quality', { params }).then(r => r.data);

export const getExecutiveSummary = (params) =>
  axiosInstance.get('/reports/executive-summary', { params }).then(r => r.data);

export const getTrend = (params) =>
  axiosInstance.get('/reports/trend', { params }).then(r => r.data);

export const getSimInventory = (params) =>
  axiosInstance.get('/reports/sim-inventory', { params }).then(r => r.data);
