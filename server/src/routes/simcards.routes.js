const express = require('express');
const router = express.Router();
const multer = require('multer');
const AdmZip = require('adm-zip');
const pdfParse = require('pdf-parse');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { protect, requirePermission } = require('../middleware/auth');
const { getModel } = require('../config/modelRegistry');
const { sendSuccess, sendError, sendPaginated } = require('../utils/responseHelper');
const validate = require('../middleware/validate');
const { validateCreateSim, validateUpdateSim, validateAssignSim } = require('../middleware/validators/simcard.validators');
const { logEvent } = require('../services/driverHistory.service');
const { PAGINATION } = require('../config/constants');

// All routes require authentication
router.use(protect);

// Multer for zip upload (memory storage, 50MB limit)
const zipUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/zip' || file.mimetype === 'application/x-zip-compressed' || path.extname(file.originalname).toLowerCase() === '.zip') {
      cb(null, true);
    } else {
      cb(new Error('Only ZIP files are allowed'));
    }
  },
});

// ═══════════════════════════════════════════════════════════
// SIM CRUD
// ═══════════════════════════════════════════════════════════

/**
 * GET /api/simcards/summary — Dashboard summary cards
 */
router.get('/summary', requirePermission('simcards.view'), async (req, res) => {
  const TelecomSim = getModel(req, 'TelecomSim');
  const SimBill = getModel(req, 'SimBill');

  // Determine last month's year/month
  const now = new Date();
  const lastMonth = now.getMonth() === 0
    ? { year: now.getFullYear() - 1, month: 12 }
    : { year: now.getFullYear(), month: now.getMonth() };

  const [statusCounts, totalSims, pendingAllocations, assigned, lastMonthBills] = await Promise.all([
    TelecomSim.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    TelecomSim.countDocuments(),
    SimBill.countDocuments({ 'allocations.status': 'allocated' }),
    TelecomSim.countDocuments({ currentDriverId: { $ne: null } }),
    SimBill.aggregate([
      { $match: { 'period.year': lastMonth.year, 'period.month': lastMonth.month } },
      {
        $group: {
          _id: null,
          totalBill: { $sum: '$totalAmount' },
          billCount: { $sum: 1 },
          idleBill: {
            $sum: { $cond: [{ $eq: ['$isIdleBill', true] }, '$totalAmount', 0] },
          },
          chargedToDrivers: {
            $sum: {
              $reduce: {
                input: '$allocations',
                initialValue: 0,
                in: { $add: ['$$value', { $ifNull: ['$$this.allocatedAmount', 0] }] },
              },
            },
          },
        },
      },
    ]),
  ]);

  const byStatus = {};
  for (const s of statusCounts) {
    byStatus[s._id] = s.count;
  }

  const lm = lastMonthBills[0] || { totalBill: 0, billCount: 0, idleBill: 0, chargedToDrivers: 0 };

  sendSuccess(res, {
    totalSims: totalSims,
    allocatedSims: assigned,
    idleSims: byStatus.idle || 0,
    active: byStatus.active || 0,
    suspended: byStatus.suspended || 0,
    terminated: byStatus.terminated || 0,
    unassigned: totalSims - assigned,
    pendingBillAllocations: pendingAllocations,
    lastMonth: {
      totalBill: lm.totalBill,
      billCount: lm.billCount,
      chargedToDrivers: lm.chargedToDrivers,
      idleBill: lm.idleBill,
    },
  });
});

/**
 * GET /api/simcards — List all SIM cards
 */
router.get('/', requirePermission('simcards.view'), async (req, res) => {
  const TelecomSim = getModel(req, 'TelecomSim');
  const page = Math.max(1, parseInt(req.query.page) || PAGINATION.DEFAULT_PAGE);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || PAGINATION.DEFAULT_LIMIT));
  const skip = (page - 1) * limit;

  const filter = {};

  if (req.query.status) filter.status = req.query.status;
  if (req.query.operator) filter.operator = req.query.operator;
  if (req.query.hasDriver === 'true') filter.currentDriverId = { $ne: null };
  if (req.query.hasDriver === 'false') filter.currentDriverId = null;

  if (req.query.search) {
    const s = req.query.search.trim();
    filter.$or = [
      { simNumber: { $regex: s, $options: 'i' } },
    ];
  }

  const [sims, total] = await Promise.all([
    TelecomSim.find(filter)
      .populate('currentDriverId', 'fullName employeeCode')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    TelecomSim.countDocuments(filter),
  ]);

  // If searching by driver name, do a secondary lookup
  if (req.query.search && !total) {
    const Driver = getModel(req, 'Driver');
    const matchingDrivers = await Driver.find({
      $or: [
        { fullName: { $regex: req.query.search.trim(), $options: 'i' } },
        { employeeCode: { $regex: req.query.search.trim(), $options: 'i' } },
      ],
    }).select('_id').lean();

    if (matchingDrivers.length) {
      const driverIds = matchingDrivers.map(d => d._id);
      const driverFilter = { ...filter };
      delete driverFilter.$or;
      driverFilter.currentDriverId = { $in: driverIds };

      const [driverSims, driverTotal] = await Promise.all([
        TelecomSim.find(driverFilter)
          .populate('currentDriverId', 'fullName employeeCode')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        TelecomSim.countDocuments(driverFilter),
      ]);

      return sendPaginated(res, driverSims, driverTotal, page, limit);
    }
  }

  sendPaginated(res, sims, total, page, limit);
});

// ══���════════════════════��═══════════════════════════════════
// BILL ROUTES (must be before /:id to avoid param conflict)
// ═════════════════════════��════════════════════════════════���

/**
 * GET /api/simcards/bills — List bills
 */
router.get('/bills', requirePermission('simcards.view'), async (req, res) => {
  const SimBill = getModel(req, 'SimBill');
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
  const skip = (page - 1) * limit;

  const filter = {};
  if (req.query.year) filter['period.year'] = parseInt(req.query.year);
  if (req.query.month) filter['period.month'] = parseInt(req.query.month);
  if (req.query.simNumber) filter.simNumber = req.query.simNumber;
  if (req.query.isIdleBill === 'true') filter.isIdleBill = true;
  if (req.query.isIdleBill === 'false') filter.isIdleBill = { $ne: true };
  if (req.query.importBatchId) filter.importBatchId = req.query.importBatchId;
  if (req.query.status) filter['allocations.status'] = req.query.status;

  const [bills, total] = await Promise.all([
    SimBill.find(filter)
      .sort({ 'period.year': -1, 'period.month': -1, simNumber: 1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    SimBill.countDocuments(filter),
  ]);

  sendPaginated(res, bills, total, page, limit);
});

/**
 * GET /api/simcards/bills/:id — Single bill detail
 */
router.get('/bills/:id', requirePermission('simcards.view'), async (req, res) => {
  const SimBill = getModel(req, 'SimBill');
  const bill = await SimBill.findById(req.params.id).lean();
  if (!bill) return sendError(res, 'Bill not found', 404);
  sendSuccess(res, bill);
});

/**
 * PUT /api/simcards/bills/:id/allocations — Manually edit bill allocations
 */
router.put('/bills/:id/allocations', requirePermission('simcards.manage_bills'), async (req, res) => {
  const SimBill = getModel(req, 'SimBill');
  const bill = await SimBill.findById(req.params.id);
  if (!bill) return sendError(res, 'Bill not found', 404);

  const { allocations } = req.body;
  if (!Array.isArray(allocations)) return sendError(res, 'allocations must be an array', 400);

  bill.allocations = allocations.map(a => ({
    driverId: a.driverId,
    driverName: a.driverName,
    driverEmployeeCode: a.driverEmployeeCode,
    fromDate: a.fromDate,
    toDate: a.toDate,
    daysUsed: a.daysUsed,
    totalDaysInPeriod: a.totalDaysInPeriod,
    allocatedAmount: a.allocatedAmount,
    isExtra: a.isExtra || false,
    deductedInSalaryRunId: a.deductedInSalaryRunId || null,
    status: a.status || 'allocated',
  }));

  bill.isIdleBill = bill.allocations.length === 0;
  await bill.save();

  sendSuccess(res, bill, 'Bill allocations updated');
});

/**
 * POST /api/simcards/bills/:billId/allocations/:allocationIndex/waive — Waive an allocation
 */
router.post('/bills/:billId/allocations/:allocationIndex/waive', requirePermission('simcards.manage_bills'), async (req, res) => {
  const SimBill = getModel(req, 'SimBill');
  const bill = await SimBill.findById(req.params.billId);
  if (!bill) return sendError(res, 'Bill not found', 404);

  const idx = parseInt(req.params.allocationIndex);
  if (isNaN(idx) || idx < 0 || idx >= bill.allocations.length) {
    return sendError(res, 'Invalid allocation index', 400);
  }

  const alloc = bill.allocations[idx];
  if (alloc.status === 'deducted') {
    return sendError(res, 'Cannot waive an already deducted allocation', 400);
  }

  alloc.status = 'waived';
  await bill.save();

  sendSuccess(res, bill, 'Allocation waived');
});

/**
 * GET /api/simcards/driver/:driverId/sim-history — SIM history for a driver
 * (Must be before /:id to avoid matching "driver" as an id param)
 */
router.get('/driver/:driverId/sim-history', requirePermission('simcards.view'), async (req, res) => {
  const SimAssignment = getModel(req, 'SimAssignment');
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
  const skip = (page - 1) * limit;

  const [assignments, total] = await Promise.all([
    SimAssignment.find({ driverId: req.params.driverId })
      .sort({ assignedDate: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    SimAssignment.countDocuments({ driverId: req.params.driverId }),
  ]);

  sendPaginated(res, assignments, total, page, limit);
});

/**
 * GET /api/simcards/:id — Single SIM detail
 */
router.get('/:id', requirePermission('simcards.view'), async (req, res) => {
  const TelecomSim = getModel(req, 'TelecomSim');
  const SimAssignment = getModel(req, 'SimAssignment');
  const SimBill = getModel(req, 'SimBill');

  const sim = await TelecomSim.findById(req.params.id)
    .populate('currentDriverId', 'fullName employeeCode status')
    .lean();

  if (!sim) return sendError(res, 'SIM card not found', 404);

  const [currentAssignment, recentBills] = await Promise.all([
    sim.currentAssignmentId
      ? SimAssignment.findById(sim.currentAssignmentId).lean()
      : null,
    SimBill.find({ simId: sim._id })
      .sort({ 'period.year': -1, 'period.month': -1 })
      .limit(6)
      .lean(),
  ]);

  sendSuccess(res, { ...sim, currentAssignment, recentBills });
});

/**
 * POST /api/simcards — Create SIM
 */
router.post('/', requirePermission('simcards.create'), validate(validateCreateSim), async (req, res) => {
  const TelecomSim = getModel(req, 'TelecomSim');

  const existing = await TelecomSim.findOne({ simNumber: req.body.simNumber });
  if (existing) return sendError(res, 'A SIM card with this number already exists', 409);

  const sim = await TelecomSim.create({
    ...req.body,
    createdBy: req.user._id,
  });

  sendSuccess(res, sim, 'SIM card created', 201);
});

/**
 * PUT /api/simcards/:id — Update SIM
 */
router.put('/:id', requirePermission('simcards.edit'), validate(validateUpdateSim), async (req, res) => {
  const TelecomSim = getModel(req, 'TelecomSim');

  const sim = await TelecomSim.findById(req.params.id);
  if (!sim) return sendError(res, 'SIM card not found', 404);

  const allowedFields = ['simNumber', 'operator', 'plan', 'monthlyPlanCost', 'accountNumber', 'accountOwner', 'status', 'notes'];
  for (const field of allowedFields) {
    if (req.body[field] !== undefined) sim[field] = req.body[field];
  }

  await sim.save();
  sendSuccess(res, sim, 'SIM card updated');
});

/**
 * DELETE /api/simcards/:id — Soft delete (terminate)
 */
router.delete('/:id', requirePermission('simcards.edit'), async (req, res) => {
  const TelecomSim = getModel(req, 'TelecomSim');
  const SimAssignment = getModel(req, 'SimAssignment');

  const sim = await TelecomSim.findById(req.params.id);
  if (!sim) return sendError(res, 'SIM card not found', 404);

  // If actively assigned, return first
  if (sim.currentDriverId) {
    const activeAssignment = await SimAssignment.findOne({ simId: sim._id, status: 'active' });
    if (activeAssignment) {
      activeAssignment.returnedDate = new Date();
      activeAssignment.status = 'returned';
      activeAssignment.returnedBy = req.user._id;
      activeAssignment.returnedByName = req.user.name;
      await activeAssignment.save();
    }

    const Driver = getModel(req, 'Driver');
    await Driver.findByIdAndUpdate(sim.currentDriverId, { telecomSimId: null });

    sim.currentDriverId = null;
    sim.currentAssignmentId = null;
  }

  sim.status = 'terminated';
  await sim.save();

  sendSuccess(res, sim, 'SIM card terminated');
});

// ═══════════════════════════════════════════════════════════
// SIM ASSIGNMENT
// ═══════════════════════════════════════════════════════════

/**
 * POST /api/simcards/:id/assign — Assign SIM to driver
 */
router.post('/:id/assign', requirePermission('simcards.assign'), validate(validateAssignSim), async (req, res) => {
  const TelecomSim = getModel(req, 'TelecomSim');
  const SimAssignment = getModel(req, 'SimAssignment');
  const Driver = getModel(req, 'Driver');

  const sim = await TelecomSim.findById(req.params.id);
  if (!sim) return sendError(res, 'SIM card not found', 404);
  if (sim.status === 'terminated') return sendError(res, 'Cannot assign a terminated SIM card', 400);

  const driver = await Driver.findById(req.body.driverId);
  if (!driver) return sendError(res, 'Driver not found', 404);

  // If SIM already has an active assignment, auto-return it
  if (sim.currentAssignmentId) {
    const prevAssignment = await SimAssignment.findOne({ simId: sim._id, status: 'active' });
    if (prevAssignment) {
      prevAssignment.returnedDate = new Date();
      prevAssignment.status = 'returned';
      prevAssignment.returnedBy = req.user._id;
      prevAssignment.returnedByName = req.user.name;
      await prevAssignment.save();

      // Clear old driver's telecomSimId
      if (prevAssignment.driverId) {
        await Driver.findByIdAndUpdate(prevAssignment.driverId, { telecomSimId: null });
        try {
          await logEvent(req, prevAssignment.driverId, 'status_change', {
            description: `SIM ${sim.simNumber} auto-returned (reassigned to ${driver.fullName})`,
            fieldName: 'telecomSimId',
            oldValue: sim._id,
            newValue: null,
          }, req.user);
        } catch (_) { /* non-critical */ }
      }
    }
  }

  // Create new assignment
  const assignment = await SimAssignment.create({
    simId: sim._id,
    driverId: driver._id,
    simNumber: sim.simNumber,
    driverName: driver.fullName,
    driverEmployeeCode: driver.employeeCode,
    assignedDate: req.body.assignedDate || new Date(),
    assignedBy: req.user._id,
    assignedByName: req.user.name,
    notes: req.body.notes,
  });

  // Update SIM
  sim.currentDriverId = driver._id;
  sim.currentAssignmentId = assignment._id;
  sim.status = 'active';
  await sim.save();

  // Update Driver
  driver.telecomSimId = sim._id;
  await driver.save();

  // Log in driver history
  try {
    await logEvent(req, driver._id, 'status_change', {
      description: `SIM ${sim.simNumber} assigned`,
      fieldName: 'telecomSimId',
      oldValue: null,
      newValue: sim._id,
    }, req.user);
  } catch (_) { /* non-critical */ }

  sendSuccess(res, assignment, 'SIM assigned to driver', 201);
});

/**
 * POST /api/simcards/:id/return — Return/unassign SIM
 */
router.post('/:id/return', requirePermission('simcards.assign'), async (req, res) => {
  const TelecomSim = getModel(req, 'TelecomSim');
  const SimAssignment = getModel(req, 'SimAssignment');
  const Driver = getModel(req, 'Driver');

  const sim = await TelecomSim.findById(req.params.id);
  if (!sim) return sendError(res, 'SIM card not found', 404);

  const activeAssignment = await SimAssignment.findOne({ simId: sim._id, status: 'active' });
  if (!activeAssignment) return sendError(res, 'No active assignment found for this SIM', 400);

  // Return the assignment
  activeAssignment.returnedDate = new Date();
  activeAssignment.status = 'returned';
  activeAssignment.returnedBy = req.user._id;
  activeAssignment.returnedByName = req.user.name;
  if (req.body.notes) activeAssignment.notes = req.body.notes;
  await activeAssignment.save();

  // Clear driver reference
  if (activeAssignment.driverId) {
    await Driver.findByIdAndUpdate(activeAssignment.driverId, { telecomSimId: null });
    try {
      await logEvent(req, activeAssignment.driverId, 'status_change', {
        description: `SIM ${sim.simNumber} returned`,
        fieldName: 'telecomSimId',
        oldValue: sim._id,
        newValue: null,
      }, req.user);
    } catch (_) { /* non-critical */ }
  }

  // Update SIM
  sim.currentDriverId = null;
  sim.currentAssignmentId = null;
  sim.status = 'idle';
  await sim.save();

  sendSuccess(res, activeAssignment, 'SIM returned successfully');
});

/**
 * GET /api/simcards/:id/assignment-history — Assignment history for a SIM
 */
router.get('/:id/assignment-history', requirePermission('simcards.view'), async (req, res) => {
  const SimAssignment = getModel(req, 'SimAssignment');
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
  const skip = (page - 1) * limit;

  const [assignments, total] = await Promise.all([
    SimAssignment.find({ simId: req.params.id })
      .sort({ assignedDate: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    SimAssignment.countDocuments({ simId: req.params.id }),
  ]);

  sendPaginated(res, assignments, total, page, limit);
});

// ═══════════════════════════════════════════════════════════
// BILL IMPORT & MANAGEMENT (helper functions)
// ═══════════════════════════════════════════════════════════

/**
 * Allocate a bill to drivers based on SimAssignment overlap with the billing period.
 */
async function allocateBillToDrivers(req, bill) {
  const SimAssignment = getModel(req, 'SimAssignment');
  const Driver = getModel(req, 'Driver');

  const { billPeriodStart, billPeriodEnd, totalAmount, simId } = bill;

  // Find all assignments that overlap the billing period
  const assignments = await SimAssignment.find({
    simId,
    assignedDate: { $lte: billPeriodEnd },
    $or: [
      { returnedDate: null },
      { returnedDate: { $gte: billPeriodStart } },
    ],
  }).sort({ assignedDate: 1 }).lean();

  if (!assignments.length) {
    bill.isIdleBill = true;
    bill.allocations = [];
    return;
  }

  bill.isIdleBill = false;
  const totalDaysInPeriod = daysBetween(billPeriodStart, billPeriodEnd) + 1;
  const allocations = [];

  for (const assignment of assignments) {
    const effectiveStart = new Date(Math.max(new Date(assignment.assignedDate).getTime(), new Date(billPeriodStart).getTime()));
    const effectiveEnd = new Date(Math.min(
      assignment.returnedDate ? new Date(assignment.returnedDate).getTime() : new Date(billPeriodEnd).getTime(),
      new Date(billPeriodEnd).getTime()
    ));

    const daysUsed = daysBetween(effectiveStart, effectiveEnd) + 1;
    if (daysUsed <= 0) continue;

    const allocatedAmount = Math.round((totalAmount * daysUsed / totalDaysInPeriod) * 100) / 100;

    // Check driver's deductSimCharges flag
    const driver = await Driver.findById(assignment.driverId).select('fullName employeeCode deductSimCharges').lean();
    const status = (driver && driver.deductSimCharges !== false) ? 'allocated' : 'waived';

    allocations.push({
      driverId: assignment.driverId,
      driverName: assignment.driverName || (driver && driver.fullName),
      driverEmployeeCode: assignment.driverEmployeeCode || (driver && driver.employeeCode),
      fromDate: effectiveStart,
      toDate: effectiveEnd,
      daysUsed,
      totalDaysInPeriod,
      allocatedAmount,
      isExtra: false,
      status,
    });
  }

  // Adjust rounding: ensure sum matches totalAmount
  if (allocations.length > 0) {
    const sum = allocations.reduce((acc, a) => acc + a.allocatedAmount, 0);
    const diff = Math.round((totalAmount - sum) * 100) / 100;
    if (diff !== 0) {
      // Add difference to the allocation with the most days
      const maxAlloc = allocations.reduce((max, a) => a.daysUsed > max.daysUsed ? a : max, allocations[0]);
      maxAlloc.allocatedAmount = Math.round((maxAlloc.allocatedAmount + diff) * 100) / 100;
    }
  }

  bill.allocations = allocations;
}

/**
 * Calculate days between two dates (inclusive count uses +1 in caller).
 */
function daysBetween(d1, d2) {
  const date1 = new Date(d1);
  const date2 = new Date(d2);
  date1.setHours(0, 0, 0, 0);
  date2.setHours(0, 0, 0, 0);
  return Math.floor((date2 - date1) / (1000 * 60 * 60 * 24));
}

/**
 * Parse an Etisalat PDF bill text to extract amounts and dates.
 */
function parseBillPdf(text) {
  const result = {
    accountNumber: null,
    billDate: null,
    billPeriodStart: null,
    billPeriodEnd: null,
    serviceRentals: 0,
    usageCharges: 0,
    oneTimeCharges: 0,
    otherCharges: 0,
    vatAmount: 0,
    totalAmount: 0,
  };

  // Account number (mobile number) — look for patterns like "05XXXXXXXX"
  const acctMatch = text.match(/(?:Account\s*(?:Number|No\.?)|Mobile\s*(?:Number|No\.?))\s*[:\-]?\s*(05\d{8})/i);
  if (acctMatch) result.accountNumber = acctMatch[1];

  // Also try matching standalone mobile number patterns
  if (!result.accountNumber) {
    const mobileMatch = text.match(/\b(05\d{8})\b/);
    if (mobileMatch) result.accountNumber = mobileMatch[1];
  }

  // Bill date
  const billDateMatch = text.match(/(?:Bill\s*Date|Invoice\s*Date|Date\s*of\s*Issue)\s*[:\-]?\s*(\d{1,2}[\s\-\/]\w{3,9}[\s\-\/]\d{4})/i);
  if (billDateMatch) {
    const parsed = new Date(billDateMatch[1]);
    if (!isNaN(parsed)) result.billDate = parsed;
  }

  // Bill period: "01 Mar 2026 - 31 Mar 2026" or "From: 01/03/2026 To: 31/03/2026"
  const periodMatch = text.match(/(?:Bill\s*Period|Billing\s*Period|Period)\s*[:\-]?\s*(\d{1,2}[\s\-\/]\w{3,9}[\s\-\/]\d{4})\s*[-–to]+\s*(\d{1,2}[\s\-\/]\w{3,9}[\s\-\/]\d{4})/i);
  if (periodMatch) {
    const start = new Date(periodMatch[1]);
    const end = new Date(periodMatch[2]);
    if (!isNaN(start)) result.billPeriodStart = start;
    if (!isNaN(end)) result.billPeriodEnd = end;
  }

  // Also try DD/MM/YYYY format
  if (!result.billPeriodStart) {
    const periodMatch2 = text.match(/(\d{1,2}\/\d{1,2}\/\d{4})\s*[-–to]+\s*(\d{1,2}\/\d{1,2}\/\d{4})/);
    if (periodMatch2) {
      const parseDMY = (s) => {
        const [d, m, y] = s.split('/');
        return new Date(+y, +m - 1, +d);
      };
      result.billPeriodStart = parseDMY(periodMatch2[1]);
      result.billPeriodEnd = parseDMY(periodMatch2[2]);
    }
  }

  // Service Rentals
  const serviceMatch = text.match(/Service\s*Rentals?\s*[:\-]?\s*(?:AED\s*)?([\d,]+\.?\d*)/i);
  if (serviceMatch) result.serviceRentals = parseFloat(serviceMatch[1].replace(/,/g, ''));

  // Usage Charges
  const usageMatch = text.match(/Usage\s*Charges?\s*[:\-]?\s*(?:AED\s*)?([\d,]+\.?\d*)/i);
  if (usageMatch) result.usageCharges = parseFloat(usageMatch[1].replace(/,/g, ''));

  // One-Time Charges
  const oneTimeMatch = text.match(/One[\s\-]*Time\s*Charges?\s*[:\-]?\s*(?:AED\s*)?([\d,]+\.?\d*)/i);
  if (oneTimeMatch) result.oneTimeCharges = parseFloat(oneTimeMatch[1].replace(/,/g, ''));

  // Other Credits & Charges
  const otherMatch = text.match(/Other\s*(?:Credits?\s*(?:&|and)\s*)?Charges?\s*[:\-]?\s*(?:AED\s*)?(-?[\d,]+\.?\d*)/i);
  if (otherMatch) result.otherCharges = parseFloat(otherMatch[1].replace(/,/g, ''));

  // VAT
  const vatMatch = text.match(/(?:VAT|Value\s*Added\s*Tax)\s*(?:\(5%\))?\s*[:\-]?\s*(?:AED\s*)?([\d,]+\.?\d*)/i);
  if (vatMatch) result.vatAmount = parseFloat(vatMatch[1].replace(/,/g, ''));

  // Total Amount Due
  const totalMatch = text.match(/Total\s*(?:Amount\s*)?Due\s*[:\-]?\s*(?:AED\s*)?([\d,]+\.?\d*)/i);
  if (totalMatch) result.totalAmount = parseFloat(totalMatch[1].replace(/,/g, ''));

  // Fallback: try "Total" if "Total Amount Due" not found
  if (!result.totalAmount) {
    const totalFallback = text.match(/\bTotal\b\s*[:\-]?\s*(?:AED\s*)?([\d,]+\.?\d*)/i);
    if (totalFallback) result.totalAmount = parseFloat(totalFallback[1].replace(/,/g, ''));
  }

  return result;
}

/**
 * Parse FileIndex.csv content. Returns array of { invoiceNumber, accountNumber, pdfFileName }
 */
function parseFileIndex(csvContent) {
  const lines = csvContent.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];

  const header = lines[0].split(',').map(h => h.trim().toUpperCase());
  const invoiceIdx = header.findIndex(h => h.includes('INVOICE'));
  const accountIdx = header.findIndex(h => h.includes('ACCOUNT'));
  const fileIdx = header.findIndex(h => h.includes('FILE') || h.includes('PDF'));

  return lines.slice(1).map(line => {
    const cols = line.split(',').map(c => c.trim());
    return {
      invoiceNumber: invoiceIdx >= 0 ? cols[invoiceIdx] : '',
      accountNumber: accountIdx >= 0 ? cols[accountIdx] : '',
      pdfFileName: fileIdx >= 0 ? cols[fileIdx] : '',
    };
  }).filter(r => r.pdfFileName);
}

/**
 * POST /api/simcards/bills/import — Bulk import bills from zip
 */
router.post('/bills/import', requirePermission('simcards.import_bills'), zipUpload.single('file'), async (req, res) => {
  if (!req.file) return sendError(res, 'ZIP file is required', 400);

  const TelecomSim = getModel(req, 'TelecomSim');
  const SimBill = getModel(req, 'SimBill');

  const importBatchId = `IMP-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const results = { imported: 0, errors: [], newSimsCreated: 0, skipped: 0 };

  try {
    const zip = new AdmZip(req.file.buffer);
    const zipEntries = zip.getEntries();

    // Find and parse FileIndex.csv
    let fileIndex = [];
    const csvEntry = zipEntries.find(e => e.entryName.toLowerCase().includes('fileindex.csv') || e.entryName.toLowerCase().includes('file_index.csv'));
    if (csvEntry) {
      const csvContent = csvEntry.getData().toString('utf8');
      fileIndex = parseFileIndex(csvContent);
    }

    // Build lookup by PDF filename
    const indexByFile = {};
    for (const fi of fileIndex) {
      const baseName = path.basename(fi.pdfFileName);
      indexByFile[baseName.toLowerCase()] = fi;
    }

    // Process each PDF in the zip
    const pdfEntries = zipEntries.filter(e =>
      e.entryName.toLowerCase().endsWith('.pdf') && !e.isDirectory
    );

    // Create uploads directory if needed
    const uploadsDir = path.join(__dirname, '..', '..', 'uploads', 'sim-bills');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    for (const pdfEntry of pdfEntries) {
      try {
        const pdfBuffer = pdfEntry.getData();
        const pdfData = await pdfParse(pdfBuffer);
        const parsed = parseBillPdf(pdfData.text);

        const baseName = path.basename(pdfEntry.entryName);
        const indexInfo = indexByFile[baseName.toLowerCase()];

        // Use accountNumber from FileIndex if available, else from PDF
        const accountNumber = (indexInfo && indexInfo.accountNumber) || parsed.accountNumber;
        const invoiceNumber = (indexInfo && indexInfo.invoiceNumber) || `INV-${Date.now()}`;

        if (!accountNumber) {
          results.errors.push({ file: baseName, error: 'Could not determine account/SIM number' });
          continue;
        }

        // Normalize SIM number (remove +971 prefix, ensure 05 format)
        let simNumber = accountNumber.replace(/[\s\-]/g, '');
        if (simNumber.startsWith('+9715')) simNumber = '05' + simNumber.slice(4);
        if (simNumber.startsWith('9715')) simNumber = '05' + simNumber.slice(3);
        if (simNumber.startsWith('5') && simNumber.length === 9) simNumber = '0' + simNumber;

        // Find or create TelecomSim
        let sim = await TelecomSim.findOne({ simNumber });
        if (!sim) {
          sim = await TelecomSim.create({
            simNumber,
            accountNumber,
            accountOwner: indexInfo ? (indexInfo.accountOwner || '') : '',
            operator: 'etisalat',
            status: 'active',
            createdBy: req.user._id,
          });
          results.newSimsCreated++;
        }

        // Determine billing period from parsed data or filename
        let billPeriodStart = parsed.billPeriodStart;
        let billPeriodEnd = parsed.billPeriodEnd;
        let year, month;

        if (billPeriodStart && billPeriodEnd) {
          year = billPeriodStart.getFullYear();
          month = billPeriodStart.getMonth() + 1;
        } else if (parsed.billDate) {
          // Fallback: use bill date to infer period (bill is usually for previous month)
          const bd = new Date(parsed.billDate);
          year = bd.getFullYear();
          month = bd.getMonth() + 1;
          billPeriodStart = new Date(year, month - 1, 1);
          billPeriodEnd = new Date(year, month, 0); // last day of month
        } else {
          // Last resort: use current month
          const now = new Date();
          year = now.getFullYear();
          month = now.getMonth() + 1;
          billPeriodStart = new Date(year, month - 1, 1);
          billPeriodEnd = new Date(year, month, 0);
        }

        // Check for existing bill
        const existingBill = await SimBill.findOne({
          simNumber,
          'period.year': year,
          'period.month': month,
        });
        if (existingBill) {
          results.skipped++;
          results.errors.push({ file: baseName, error: `Bill already exists for ${simNumber} ${year}-${String(month).padStart(2, '0')}` });
          continue;
        }

        // Save PDF
        const pdfFileName = `${simNumber}_${year}_${String(month).padStart(2, '0')}_${crypto.randomBytes(4).toString('hex')}.pdf`;
        const pdfFilePath = path.join(uploadsDir, pdfFileName);
        fs.writeFileSync(pdfFilePath, pdfBuffer);

        // Create bill
        const bill = new SimBill({
          simId: sim._id,
          simNumber,
          invoiceNumber,
          period: { year, month },
          billDate: parsed.billDate,
          billPeriodStart,
          billPeriodEnd,
          serviceRentals: parsed.serviceRentals,
          usageCharges: parsed.usageCharges,
          oneTimeCharges: parsed.oneTimeCharges,
          otherCharges: parsed.otherCharges,
          vatAmount: parsed.vatAmount,
          totalAmount: parsed.totalAmount || 0,
          accountOwner: sim.accountOwner,
          pdfFileKey: pdfFileName,
          importBatchId,
          createdBy: req.user._id,
        });

        // Allocate to drivers
        if (bill.totalAmount > 0) {
          await allocateBillToDrivers(req, bill);
        } else {
          bill.isIdleBill = true;
        }

        await bill.save();
        results.imported++;
      } catch (err) {
        results.errors.push({ file: path.basename(pdfEntry.entryName), error: err.message });
      }
    }

    sendSuccess(res, {
      ...results,
      importBatchId,
    }, `Imported ${results.imported} bills`);
  } catch (err) {
    sendError(res, `Failed to process ZIP file: ${err.message}`, 500);
  }
});

module.exports = router;
