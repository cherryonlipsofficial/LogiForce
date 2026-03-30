const express = require('express');
const router = express.Router();
const { protect, requirePermission } = require('../middleware/auth');
const salaryService = require('../services/salary.service');
const { SalaryRun, CompanySettings, Client } = require('../models');
const { sendSuccess, sendError, sendPaginated } = require('../utils/responseHelper');
const { PAGINATION } = require('../config/constants');
const validate = require('../middleware/validate');
const { runSalaryValidation, adjustSalaryValidation, disputeSalaryValidation, manualDeductionValidation } = require('../middleware/validators/salary.validators');
const auditLogger = require('../utils/auditLogger');
const { generatePayslipPDF } = require('../utils/pdfGenerator');

// All routes are protected
router.use(protect);

// POST /api/salary/run — trigger payroll run for client/period
router.post('/run', requirePermission('salary.run'), validate(runSalaryValidation), async (req, res) => {
  const { clientId, projectId, year, month, includeOT, includeTransport } = req.body;

  // Check for existing runs in this period for the same project (duplicate check)
  const existingRuns = await SalaryRun.find({
    clientId,
    projectId,
    'period.year': parseInt(year),
    'period.month': parseInt(month),
  });

  if (existingRuns.length > 0) {
    return sendError(
      res,
      `Salary runs already exist for this project/period (${existingRuns.length} runs). Delete or resolve them before re-running.`,
      409
    );
  }

  const result = await salaryService.runPayroll(
    clientId,
    projectId,
    parseInt(year),
    parseInt(month),
    req.user._id,
    { includeOT: !!includeOT, includeTransport: !!includeTransport }
  );

  // Audit log
  await auditLogger.logChange('SalaryRun', null, 'payroll', null, `${year}-${month} for client ${clientId} project ${projectId}`, req.user._id, 'salary_run');

  sendSuccess(res, result, 'Payroll run completed', 201);
});

// GET /api/salary/runs — list runs with filters
router.get('/runs', requirePermission('salary.view'), async (req, res) => {
  const page = parseInt(req.query.page) || PAGINATION.DEFAULT_PAGE;
  const limit = parseInt(req.query.limit) || PAGINATION.DEFAULT_LIMIT;
  const skip = (page - 1) * limit;

  const query = {};
  if (req.query.clientId) query.clientId = req.query.clientId;
  if (req.query.driverId) query.driverId = req.query.driverId;
  if (req.query.status) query.status = req.query.status;
  if (req.query.year) query['period.year'] = parseInt(req.query.year);
  if (req.query.month) query['period.month'] = parseInt(req.query.month);

  const [runs, total] = await Promise.all([
    SalaryRun.find(query)
      .populate('driverId', 'fullName employeeCode bankName iban')
      .populate('clientId', 'name')
      .populate('projectId', 'name')
      .populate('processedBy', 'name')
      .populate('approvedBy', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    SalaryRun.countDocuments(query),
  ]);

  sendPaginated(res, runs, total, page, limit);
});

// GET /api/salary/runs/:id — get single run with full breakdown
router.get('/runs/:id', requirePermission('salary.view'), async (req, res) => {
  const run = await SalaryRun.findById(req.params.id)
    .populate('driverId', 'fullName employeeCode bankName iban payStructure')
    .populate('clientId', 'name')
    .populate('projectId', 'name')
    .populate('attendanceRecordId')
    .populate('processedBy', 'name')
    .populate('approvedBy', 'name');

  if (!run) return sendError(res, 'Salary run not found', 404);

  sendSuccess(res, run);
});

// PUT /api/salary/runs/:id/approve — approve single run
router.put('/runs/:id/approve', requirePermission('salary.approve'), async (req, res) => {
  const run = await salaryService.approveSalaryRun(req.params.id, req.user._id);

  // Audit log
  await auditLogger.logChange('SalaryRun', req.params.id, 'status', 'draft', 'approved', req.user._id, 'salary_approval');

  sendSuccess(res, run, 'Salary run approved');
});

// PUT /api/salary/runs/:id/adjust — add manual adjustment with reason
router.put('/runs/:id/adjust', requirePermission('salary.adjust'), validate(adjustSalaryValidation), async (req, res) => {
  const { type, amount, reason } = req.body;

  const run = await SalaryRun.findById(req.params.id);
  if (!run) return sendError(res, 'Salary run not found', 404);

  if (run.status === 'approved' || run.status === 'paid') {
    return sendError(res, `Cannot adjust a ${run.status} salary run`, 400);
  }

  const adjustmentAmount = parseFloat(amount);

  if (type === 'deduction') {
    run.deductions.push({
      type: 'manual_adjustment',
      referenceId: null,
      amount: adjustmentAmount,
      description: `Manual deduction: ${reason}`,
      status: 'applied',
    });
    run.totalDeductions += adjustmentAmount;
    run.netSalary = Math.max(0, run.grossSalary - run.totalDeductions);
  } else {
    // allowance, bonus, correction — add to gross and net
    run.allowances.push({
      type: `manual_${type}`,
      amount: adjustmentAmount,
    });
    run.grossSalary += adjustmentAmount;
    run.netSalary = Math.max(0, run.grossSalary - run.totalDeductions);
  }

  run.notes = run.notes
    ? `${run.notes}\nAdjustment (${type}): ${adjustmentAmount} AED - ${reason}`
    : `Adjustment (${type}): ${adjustmentAmount} AED - ${reason}`;

  await run.save();
  sendSuccess(res, run, 'Salary run adjusted');
});

// POST /api/salary/runs/:id/deduction — manually add a typed deduction (role-gated)
router.post('/runs/:id/deduction', requirePermission('salary.manage_deductions'), validate(manualDeductionValidation), async (req, res) => {
  const { type, amount, description } = req.body;

  const run = await salaryService.addManualDeduction(
    req.params.id,
    { type, amount, description },
    req.user._id
  );

  await auditLogger.logChange('SalaryRun', req.params.id, 'deduction_added', null, `${type}: ${amount} AED`, req.user._id, 'manual_deduction');

  sendSuccess(res, run, 'Deduction added');
});

// DELETE /api/salary/runs/:id — delete a salary run (draft/approved only)
router.delete('/runs/:id', requirePermission('salary.delete'), async (req, res) => {
  const run = await SalaryRun.findById(req.params.id);
  if (!run) return sendError(res, 'Salary run not found', 404);

  if (run.status === 'paid') {
    return sendError(res, 'Cannot delete a paid salary run', 400);
  }

  await SalaryRun.findByIdAndDelete(req.params.id);

  await auditLogger.logChange('SalaryRun', req.params.id, 'delete', run.status, null, req.user._id, 'salary_run_deletion');

  sendSuccess(res, null, 'Salary run deleted');
});

// PUT /api/salary/runs/:id/pay — mark an approved salary run as paid
router.put('/runs/:id/pay', requirePermission('salary.pay'), async (req, res) => {
  const run = await SalaryRun.findById(req.params.id);
  if (!run) return sendError(res, 'Salary run not found', 404);

  if (run.status !== 'approved') {
    return sendError(res, `Cannot mark a ${run.status} salary run as paid`, 400);
  }

  run.status = 'paid';
  run.paidAt = new Date();

  await run.save();

  await auditLogger.logChange('SalaryRun', req.params.id, 'status', 'approved', 'paid', req.user._id, 'salary_payment');

  sendSuccess(res, run, 'Salary run marked as paid');
});

// POST /api/salary/runs/:id/dispute — raise dispute on a salary run
router.post('/runs/:id/dispute', requirePermission('salary.dispute'), validate(disputeSalaryValidation), async (req, res) => {
  const { reason } = req.body;

  const run = await SalaryRun.findById(req.params.id);
  if (!run) return sendError(res, 'Salary run not found', 404);

  if (run.status === 'paid') {
    return sendError(res, 'Cannot dispute a paid salary run', 400);
  }

  run.status = 'disputed';
  run.notes = run.notes
    ? `${run.notes}\nDispute: ${reason}`
    : `Dispute: ${reason}`;

  await run.save();
  sendSuccess(res, run, 'Salary run disputed');
});

// GET /api/salary/runs/:id/payslip — generate payslip PDF for a salary run
router.get('/runs/:id/payslip', requirePermission('salary.view'), async (req, res) => {
  const run = await SalaryRun.findById(req.params.id)
    .populate('driverId', 'fullName fullNameArabic employeeCode bankName iban payStructure baseSalary')
    .populate('clientId', 'name')
    .populate('projectId', 'name projectCode');

  if (!run) return sendError(res, 'Salary run not found', 404);

  const companySettings = await CompanySettings.getSettings();

  const pdfBuffer = await generatePayslipPDF(
    run.toObject(),
    run.driverId,
    run.projectId,
    run.clientId,
    companySettings
  );

  const periodStr = run.period
    ? `${run.period.year}_${String(run.period.month).padStart(2, '0')}`
    : 'unknown';
  const driverName = (run.driverId?.fullName || 'driver').replace(/\s+/g, '_');
  const filename = `Payslip_${driverName}_${periodStr}.pdf`;

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(pdfBuffer);
});

// GET /api/salary/wps-file — generate WPS-format CSV for period
router.get('/wps-file', requirePermission('salary.export_wps'), async (req, res) => {
  const { clientId, year, month } = req.query;

  if (!year || !month) {
    return sendError(res, 'year and month are required', 400);
  }

  const csvContent = await salaryService.generateWpsFile(
    clientId || null,
    parseInt(year),
    parseInt(month)
  );

  const filename = `WPS_${year}_${String(month).padStart(2, '0')}${clientId ? '_' + clientId : ''}.csv`;

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csvContent);
});

module.exports = router;
