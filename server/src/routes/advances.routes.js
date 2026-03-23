const express = require('express');
const router = express.Router();
const { protect, restrictTo } = require('../middleware/auth');
const { Advance, DriverLedger } = require('../models');
const { sendSuccess, sendError, sendPaginated } = require('../utils/responseHelper');
const { PAGINATION } = require('../config/constants');
const validate = require('../middleware/validate');
const { issueAdvanceValidation, recoverAdvanceValidation } = require('../middleware/validators/advance.validators');
const auditLogger = require('../utils/auditLogger');

// All routes are protected
router.use(protect);

// POST /api/advances — issue advance to driver
router.post('/', restrictTo('admin', 'accountant'), validate(issueAdvanceValidation), async (req, res) => {
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
router.get('/', async (req, res) => {
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
router.put('/:id/recover', restrictTo('admin', 'accountant'), validate(recoverAdvanceValidation), async (req, res) => {
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

module.exports = router;
