const express = require('express');
const router = express.Router();
const { protect, restrictTo } = require('../middleware/auth');
const salaryService = require('../services/salary.service');
const { SalaryRun } = require('../models');
const { sendSuccess, sendError, sendPaginated } = require('../utils/responseHelper');
const { PAGINATION } = require('../config/constants');
const validate = require('../middleware/validate');
const { runSalaryValidation, adjustSalaryValidation, disputeSalaryValidation } = require('../middleware/validators/salary.validators');
const auditLogger = require('../utils/auditLogger');

// All routes are protected
router.use(protect);

// POST /api/salary/run — trigger payroll run for client/period
router.post('/run', restrictTo('admin'), validate(runSalaryValidation), async (req, res) => {
  const { clientId, year, month } = req.body;

  // Check for existing runs in this period (duplicate check)
  const existingRuns = await SalaryRun.find({
    clientId,
    'period.year': parseInt(year),
    'period.month': parseInt(month),
  });

  if (existingRuns.length > 0) {
    return sendError(
      res,
      `Salary runs already exist for this period (${existingRuns.length} runs). Delete or resolve them before re-running.`,
      409
    );
  }

  const result = await salaryService.runPayroll(
    clientId,
    parseInt(year),
    parseInt(month),
    req.user._id
  );

  // Audit log
  await auditLogger.logChange('SalaryRun', null, 'payroll', null, `${year}-${month} for client ${clientId}`, req.user._id, 'salary_run');

  sendSuccess(res, result, 'Payroll run completed', 201);
});

// GET /api/salary/runs — list runs with filters
router.get('/runs', async (req, res) => {
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
router.get('/runs/:id', async (req, res) => {
  const run = await SalaryRun.findById(req.params.id)
    .populate('driverId', 'fullName employeeCode bankName iban payStructure')
    .populate('clientId', 'name')
    .populate('attendanceRecordId')
    .populate('processedBy', 'name')
    .populate('approvedBy', 'name');

  if (!run) return sendError(res, 'Salary run not found', 404);

  sendSuccess(res, run);
});

// PUT /api/salary/runs/:id/approve — approve single run
router.put('/runs/:id/approve', restrictTo('admin', 'accountant'), async (req, res) => {
  const run = await salaryService.approveSalaryRun(req.params.id, req.user._id);

  // Audit log
  await auditLogger.logChange('SalaryRun', req.params.id, 'status', 'draft', 'approved', req.user._id, 'salary_approval');

  sendSuccess(res, run, 'Salary run approved');
});

// PUT /api/salary/runs/:id/adjust — add manual adjustment with reason
router.put('/runs/:id/adjust', restrictTo('admin', 'accountant'), validate(adjustSalaryValidation), async (req, res) => {
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

// POST /api/salary/runs/:id/dispute — raise dispute on a salary run
router.post('/runs/:id/dispute', validate(disputeSalaryValidation), async (req, res) => {
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

// GET /api/salary/wps-file — generate WPS-format CSV for period
router.get('/wps-file', restrictTo('admin', 'accountant'), async (req, res) => {
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
