const express = require('express');
const router = express.Router();
const { protect, requirePermission } = require('../middleware/auth');
const { Advance, DriverLedger, DriverAdvance } = require('../models');
const { sendSuccess, sendError, sendPaginated } = require('../utils/responseHelper');
const { PAGINATION } = require('../config/constants');
const validate = require('../middleware/validate');
const { issueAdvanceValidation, recoverAdvanceValidation } = require('../middleware/validators/advance.validators');
const auditLogger = require('../utils/auditLogger');
const { requestAdvance, reviewAdvance } = require('../services/driverAdvance.service');

// All routes are protected
router.use(protect);

// POST /api/advances — issue advance to driver
router.post('/', requirePermission('advances.approve'), validate(issueAdvanceValidation), async (req, res) => {
  const { driverId, amountIssued, notes } = req.body;

  const advance = await Advance.create({
    driverId,
    amountIssued: parseFloat(amountIssued),
    issueDate: new Date(),
    status: 'active',
    approvedBy: req.user._id,
    notes,
  });

  // Post ledger entry
  const lastEntry = await DriverLedger.findOne({ driverId }).sort({ createdAt: -1 });
  const previousBalance = lastEntry?.runningBalance || 0;

  await DriverLedger.create({
    driverId,
    entryType: 'advance_issued',
    debit: parseFloat(amountIssued),
    credit: 0,
    runningBalance: previousBalance - parseFloat(amountIssued),
    description: `Advance issued${notes ? ': ' + notes : ''}`,
    referenceId: advance._id.toString(),
    createdBy: req.user._id,
  });

  // Audit log for ledger manual entry
  await auditLogger.logChange('DriverLedger', advance._id, 'advance_issued', null, amountIssued, req.user._id, 'ledger_manual_entry');

  sendSuccess(res, advance, 'Advance issued successfully', 201);
});

// GET /api/advances — list all advances
router.get('/', requirePermission('advances.view'), async (req, res) => {
  const page = parseInt(req.query.page) || PAGINATION.DEFAULT_PAGE;
  const limit = parseInt(req.query.limit) || PAGINATION.DEFAULT_LIMIT;
  const skip = (page - 1) * limit;

  const query = {};
  if (req.query.status) query.status = req.query.status;
  if (req.query.driverId) query.driverId = req.query.driverId;

  const [advances, total] = await Promise.all([
    Advance.find(query)
      .populate('driverId', 'fullName employeeCode')
      .populate('approvedBy', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Advance.countDocuments(query),
  ]);

  sendPaginated(res, advances, total, page, limit);
});

// PUT /api/advances/:id/recover — manual recovery entry
router.put('/:id/recover', requirePermission('advances.manage_recovery'), validate(recoverAdvanceValidation), async (req, res) => {
  const { amount, salaryRunId } = req.body;

  const advance = await Advance.findById(req.params.id);
  if (!advance) return sendError(res, 'Advance not found', 404);

  if (advance.status !== 'active') {
    return sendError(res, 'Advance is not active', 400);
  }

  const recoveryAmount = parseFloat(amount);
  const outstanding = advance.amountIssued - advance.amountRecovered;

  if (recoveryAmount > outstanding) {
    return sendError(res, `Recovery amount exceeds outstanding balance of ${outstanding}`, 400);
  }

  advance.amountRecovered += recoveryAmount;
  advance.recoverySchedule.push({
    salaryRunId: salaryRunId || null,
    amount: recoveryAmount,
    date: new Date(),
  });

  if (advance.amountRecovered >= advance.amountIssued) {
    advance.status = 'fully_recovered';
  }

  await advance.save();

  // Post ledger entry
  const lastEntry = await DriverLedger.findOne({ driverId: advance.driverId })
    .sort({ createdAt: -1 });
  const previousBalance = lastEntry?.runningBalance || 0;

  await DriverLedger.create({
    driverId: advance.driverId,
    entryType: 'advance_recovery',
    debit: 0,
    credit: recoveryAmount,
    runningBalance: previousBalance + recoveryAmount,
    description: `Advance recovery`,
    referenceId: advance._id.toString(),
    createdBy: req.user._id,
  });

  sendSuccess(res, advance, 'Recovery recorded successfully');
});

// ─── Driver Advance (request → review workflow) ───────────────────────

// POST /api/advances/driver — Sales or Ops requests an advance for a driver
router.post('/driver', requirePermission('advances.request'), async (req, res) => {
  const { driverId, projectId, clientId, amount, reason } = req.body;

  if (!amount || amount <= 0) {
    return sendError(res, 'Amount must be greater than zero', 400);
  }
  if (!reason || !reason.trim()) {
    return sendError(res, 'Reason is required', 400);
  }

  const advance = await requestAdvance(
    { driverId, projectId, clientId, amount, reason },
    req.user._id
  );
  sendSuccess(res, advance, 'Advance requested', 201);
});

// GET /api/advances/driver — list driver advances with filters + pagination + stats
router.get('/driver', requirePermission('advances.view'), async (req, res) => {
  const page = parseInt(req.query.page) || PAGINATION.DEFAULT_PAGE;
  const limit = parseInt(req.query.limit) || PAGINATION.DEFAULT_LIMIT;
  const skip = (page - 1) * limit;

  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.driverId) filter.driverId = req.query.driverId;
  if (req.query.projectId) filter.projectId = req.query.projectId;

  const [advances, total, statsAgg] = await Promise.all([
    DriverAdvance.find(filter)
      .populate('driverId', 'fullName employeeCode')
      .populate('projectId', 'name')
      .populate('requestedBy', 'name')
      .sort({ requestedAt: -1 })
      .skip(skip)
      .limit(limit),
    DriverAdvance.countDocuments(filter),
    DriverAdvance.aggregate([
      {
        $group: {
          _id: null,
          pending: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
          approved: { $sum: { $cond: [{ $eq: ['$status', 'approved'] }, 1, 0] } },
          recovered: { $sum: { $cond: [{ $eq: ['$status', 'fully_recovered'] }, 1, 0] } },
          totalOutstanding: {
            $sum: {
              $cond: [{ $eq: ['$status', 'approved'] }, { $subtract: ['$amount', '$totalRecovered'] }, 0],
            },
          },
        },
      },
    ]),
  ]);

  const stats = statsAgg[0] || { pending: 0, approved: 0, recovered: 0, totalOutstanding: 0 };

  res.json({
    success: true,
    data: advances,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    stats,
  });
});

// GET /api/advances/driver/:id — single driver advance
router.get('/driver/:id', requirePermission('advances.view'), async (req, res) => {
  const advance = await DriverAdvance.findById(req.params.id)
    .populate('driverId', 'fullName employeeCode baseSalary')
    .populate('projectId', 'name')
    .populate('requestedBy', 'name')
    .populate('reviewedBy', 'name');
  if (!advance) return sendError(res, 'Advance not found', 404);
  res.json({ success: true, data: advance });
});

// PUT /api/advances/driver/:id/review — Accounts approves or rejects
router.put('/driver/:id/review', requirePermission('advances.approve'), async (req, res) => {
  const { decision, reviewNotes, recoverySchedule } = req.body;

  if (!['approved', 'rejected'].includes(decision)) {
    return sendError(res, 'Decision must be "approved" or "rejected"', 400);
  }
  if (decision === 'approved' && (!recoverySchedule || !recoverySchedule.length)) {
    return sendError(res, 'Recovery schedule is required when approving', 400);
  }

  const advance = await reviewAdvance(
    req.params.id,
    decision,
    { reviewNotes, recoverySchedule },
    req.user._id
  );
  res.json({
    success: true,
    message: `Advance ${decision}.`,
    data: advance,
  });
});

// GET /api/advances/by-driver/:id — advances for a specific driver
router.get('/by-driver/:id', requirePermission('advances.view'), async (req, res) => {
  const advances = await DriverAdvance.find({ driverId: req.params.id })
    .populate('requestedBy', 'name')
    .populate('reviewedBy', 'name')
    .sort({ createdAt: -1 });
  res.json({ success: true, data: advances });
});

module.exports = router;
