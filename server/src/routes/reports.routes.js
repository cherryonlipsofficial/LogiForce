const express = require('express');
const router = express.Router();
const { protect, requirePermission } = require('../middleware/auth');
const { getModel } = require('../config/modelRegistry');
const { sendSuccess, sendError } = require('../utils/responseHelper');

// All routes are protected
router.use(protect);

// GET /api/reports/payroll-summary — total gross/net/deductions for period, grouped by client
// Optional: ?projectId=xxx to filter by a specific project
router.get('/payroll-summary', requirePermission('reports.financial'), async (req, res) => {
  const SalaryRun = getModel(req, 'SalaryRun');
  const { year, month, projectId } = req.query;
  if (!year || !month) return sendError(res, 'year and month are required', 400);

  const matchStage = {
    'period.year': parseInt(year),
    'period.month': parseInt(month),
    status: { $in: ['approved', 'paid'] },
  };

  if (projectId) {
    const mongoose = require('mongoose');
    matchStage.projectId = new mongoose.Types.ObjectId(projectId);
  }

  const summary = await SalaryRun.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: '$clientId',
        driverCount: { $sum: 1 },
        totalGross: { $sum: '$grossSalary' },
        totalDeductions: { $sum: '$totalDeductions' },
        totalNet: { $sum: '$netSalary' },
      },
    },
    {
      $lookup: {
        from: 'clients',
        localField: '_id',
        foreignField: '_id',
        as: 'client',
      },
    },
    { $unwind: '$client' },
    {
      $project: {
        clientId: '$_id',
        clientName: '$client.name',
        driverCount: 1,
        totalGross: 1,
        totalDeductions: 1,
        totalNet: 1,
      },
    },
  ]);

  sendSuccess(res, summary);
});

// GET /api/reports/project-pipeline — 5 most recently active projects with stats
router.get('/project-pipeline', requirePermission('reports.view'), async (req, res) => {
  try {
    const Project = getModel(req, 'Project');
    const Driver = getModel(req, 'Driver');
    const ProjectContract = getModel(req, 'ProjectContract');
    const mongoose = require('mongoose');

    const projects = await Project.find({ status: 'active' })
      .sort({ updatedAt: -1 })
      .limit(5)
      .populate('clientId', 'name')
      .lean();

    const result = [];
    for (const proj of projects) {
      const driverCount = await Driver.countDocuments({ projectId: proj._id, status: 'active' });

      // Find the active contract for this project
      const contract = await ProjectContract.findOne({
        projectId: proj._id,
        status: 'active',
      }).lean();

      let contractDaysLeft = null;
      if (contract?.endDate) {
        contractDaysLeft = Math.ceil((new Date(contract.endDate) - new Date()) / (1000 * 60 * 60 * 24));
      }

      result.push({
        _id: proj._id,
        projectName: proj.name,
        clientName: proj.clientId?.name || 'Unknown',
        driverCount,
        plannedDriverCount: proj.plannedDriverCount || 0,
        contractDaysLeft,
      });
    }

    sendSuccess(res, result);
  } catch (err) {
    sendError(res, err.message, 500);
  }
});

// GET /api/reports/invoice-aging — outstanding invoices grouped by age
router.get('/invoice-aging', requirePermission('reports.financial'), async (req, res) => {
  const Invoice = getModel(req, 'Invoice');
  const now = new Date();

  const invoices = await Invoice.find({
    status: { $in: ['sent', 'overdue'] },
  }).populate('clientId', 'name').lean();

  const buckets = {
    'current_0_30': [],
    'overdue_31_60': [],
    'overdue_61_90': [],
    'overdue_90_plus': [],
  };

  for (const inv of invoices) {
    const dueDate = new Date(inv.dueDate);
    const daysOverdue = Math.floor((now - dueDate) / (1000 * 60 * 60 * 24));

    const entry = {
      invoiceNo: inv.invoiceNo,
      clientName: inv.clientId?.name,
      total: inv.total,
      dueDate: inv.dueDate,
      daysOverdue: Math.max(0, daysOverdue),
    };

    if (daysOverdue <= 0) {
      buckets.current_0_30.push(entry);
    } else if (daysOverdue <= 30) {
      buckets.current_0_30.push(entry);
    } else if (daysOverdue <= 60) {
      buckets.overdue_31_60.push(entry);
    } else if (daysOverdue <= 90) {
      buckets.overdue_61_90.push(entry);
    } else {
      buckets.overdue_90_plus.push(entry);
    }
  }

  const summary = {
    current_0_30: {
      count: buckets.current_0_30.length,
      total: buckets.current_0_30.reduce((s, i) => s + i.total, 0),
      invoices: buckets.current_0_30,
    },
    overdue_31_60: {
      count: buckets.overdue_31_60.length,
      total: buckets.overdue_31_60.reduce((s, i) => s + i.total, 0),
      invoices: buckets.overdue_31_60,
    },
    overdue_61_90: {
      count: buckets.overdue_61_90.length,
      total: buckets.overdue_61_90.reduce((s, i) => s + i.total, 0),
      invoices: buckets.overdue_61_90,
    },
    overdue_90_plus: {
      count: buckets.overdue_90_plus.length,
      total: buckets.overdue_90_plus.reduce((s, i) => s + i.total, 0),
      invoices: buckets.overdue_90_plus,
    },
  };

  sendSuccess(res, summary);
});

// GET /api/reports/cost-per-driver — average cost per driver per client per month
router.get('/cost-per-driver', requirePermission('reports.financial'), async (req, res) => {
  const SalaryRun = getModel(req, 'SalaryRun');
  const { year } = req.query;
  const matchStage = { status: { $in: ['approved', 'paid'] } };
  if (year) matchStage['period.year'] = parseInt(year);

  const result = await SalaryRun.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: {
          clientId: '$clientId',
          year: '$period.year',
          month: '$period.month',
        },
        driverCount: { $sum: 1 },
        totalCost: { $sum: '$grossSalary' },
      },
    },
    {
      $addFields: {
        avgCostPerDriver: { $divide: ['$totalCost', '$driverCount'] },
      },
    },
    {
      $lookup: {
        from: 'clients',
        localField: '_id.clientId',
        foreignField: '_id',
        as: 'client',
      },
    },
    { $unwind: '$client' },
    {
      $project: {
        clientId: '$_id.clientId',
        clientName: '$client.name',
        year: '$_id.year',
        month: '$_id.month',
        driverCount: 1,
        totalCost: 1,
        avgCostPerDriver: { $round: ['$avgCostPerDriver', 2] },
      },
    },
    { $sort: { year: -1, month: -1, clientName: 1 } },
  ]);

  sendSuccess(res, result);
});

// GET /api/reports/advance-outstanding — all drivers with non-zero advance balance
router.get('/advance-outstanding', requirePermission('reports.financial'), async (req, res) => {
  const Advance = getModel(req, 'Advance');
  const advances = await Advance.find({ status: 'active' })
    .populate('driverId', 'fullName employeeCode clientId')
    .populate('approvedBy', 'name')
    .lean();

  const result = advances
    .filter((a) => a.amountIssued - a.amountRecovered > 0)
    .map((a) => ({
      advanceId: a._id,
      driverId: a.driverId?._id,
      driverName: a.driverId?.fullName,
      employeeCode: a.driverId?.employeeCode,
      amountIssued: a.amountIssued,
      amountRecovered: a.amountRecovered,
      outstanding: a.amountIssued - a.amountRecovered,
      issueDate: a.issueDate,
      approvedBy: a.approvedBy?.name,
    }));

  sendSuccess(res, result);
});

// GET /api/reports/document-expiry — drivers with documents expiring in next 30/60/90 days
router.get('/document-expiry', requirePermission('reports.view'), async (req, res) => {
  const DriverDocument = getModel(req, 'DriverDocument');
  const days = parseInt(req.query.days) || 30;
  const now = new Date();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + days);

  const documents = await DriverDocument.find({
    expiryDate: { $gte: now, $lte: cutoff },
    status: { $ne: 'expired' },
  })
    .populate('driverId', 'fullName employeeCode clientId status')
    .sort({ expiryDate: 1 })
    .lean();

  const result = documents.map((doc) => ({
    documentId: doc._id,
    docType: doc.docType,
    expiryDate: doc.expiryDate,
    daysUntilExpiry: Math.ceil((new Date(doc.expiryDate) - now) / (1000 * 60 * 60 * 24)),
    driverId: doc.driverId?._id,
    driverName: doc.driverId?.fullName,
    employeeCode: doc.driverId?.employeeCode,
    driverStatus: doc.driverId?.status,
  }));

  sendSuccess(res, result);
});

// GET /api/reports/fleet-utilisation — vehicle fleet stats by supplier
router.get('/fleet-utilisation', requirePermission('reports.view'), async (req, res) => {
  try {
    const Supplier = getModel(req, 'Supplier');
    const Driver = getModel(req, 'Driver');
    const suppliers = await Supplier.find({ isActive: true }).lean();

    const bySupplier = [];
    for (const sup of suppliers) {
      const drivers = await Driver.find({ supplierId: sup._id }).lean();
      const assigned = drivers.filter(
        (d) => d.status === 'active' && d.vehiclePlate
      ).length;
      const available = Math.max(0, (sup.vehicleCount || 0) - assigned);
      const maintenance = drivers.filter(
        (d) => d.status === 'suspended' && d.vehiclePlate
      ).length;
      const offHired = drivers.filter(
        (d) =>
          ['resigned', 'offboarded'].includes(d.status) && d.vehiclePlate
      ).length;

      bySupplier.push({
        name: sup.name,
        supplierId: sup._id,
        assigned,
        available,
        maintenance,
        offHired,
        total: sup.vehicleCount || assigned + available,
      });
    }

    // By vehicle type (Driver already resolved above)
    const allDriversWithVehicle = await Driver.find({
      vehiclePlate: { $ne: null, $exists: true },
    }).select('status vehicleType vehiclePlate').lean();
    const typeMap = {};
    for (const d of allDriversWithVehicle) {
      const type = d.vehicleType || 'Unknown';
      if (!typeMap[type]) typeMap[type] = { type, assigned: 0, available: 0 };
      if (d.status === 'active') {
        typeMap[type].assigned++;
      } else {
        typeMap[type].available++;
      }
    }

    sendSuccess(res, {
      bySupplier,
      byType: Object.values(typeMap),
    });
  } catch (err) {
    sendError(res, err.message, 500);
  }
});

// GET /api/reports/vehicle-cost-per-driver — vehicle rental deductions by driver for a period
router.get('/vehicle-cost-per-driver', requirePermission('reports.financial'), async (req, res) => {
  try {
    const SalaryRun = getModel(req, 'SalaryRun');
    const { year, month } = req.query;
    if (!year || !month) return sendError(res, 'year and month are required', 400);

    const runs = await SalaryRun.find({
      'period.year': parseInt(year),
      'period.month': parseInt(month),
      status: { $in: ['draft', 'approved', 'paid'] },
      'deductions.type': 'vehicle_rental',
      isDeleted: { $ne: true },
    })
      .populate('driverId', 'fullName employeeCode vehiclePlate vehicleType')
      .populate('clientId', 'name')
      .lean();

    const result = runs
      .map((run) => {
        const vehicleDed = run.deductions.find(
          (d) => d.type === 'vehicle_rental'
        );
        if (!vehicleDed) return null;
        return {
          driverName: run.driverId?.fullName,
          employeeCode: run.driverId?.employeeCode,
          clientName: run.clientId?.name,
          vehiclePlate: run.driverId?.vehiclePlate,
          vehicleMake: run.driverId?.vehicleType || '',
          vehicleModel: '',
          monthlyRate: vehicleDed.amount,
          proratedAmount: vehicleDed.amount !== run.deductions.find((d) => d.type === 'vehicle_rental')?.amount
            ? vehicleDed.amount
            : null,
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        const clientCmp = (a.clientName || '').localeCompare(b.clientName || '');
        if (clientCmp !== 0) return clientCmp;
        return (a.driverName || '').localeCompare(b.driverName || '');
      });

    sendSuccess(res, result);
  } catch (err) {
    sendError(res, err.message, 500);
  }
});

// GET /api/reports/statement-of-accounts — per-project statement
router.get('/statement-of-accounts', requirePermission('reports.statement_of_accounts'), async (req, res) => {
  const { projectId, year } = req.query;
  if (!projectId) return sendError(res, 'projectId is required', 400);

  const creditNoteService = require('../services/creditNote.service');
  const result = await creditNoteService.getStatementOfAccounts(
    projectId,
    year ? parseInt(year) : new Date().getFullYear()
  );

  sendSuccess(res, result);
});

// GET /api/reports/alert-count — count actionable alerts for the logged-in user
router.get('/alert-count', async (req, res) => {
  try {
    const Invoice = getModel(req, 'Invoice');
    const DriverDocument = getModel(req, 'DriverDocument');
    const ProjectContract = getModel(req, 'ProjectContract');
    const GuaranteePassport = getModel(req, 'GuaranteePassport');
    const now = new Date();
    const in30Days = new Date();
    in30Days.setDate(in30Days.getDate() + 30);
    const in7Days = new Date();
    in7Days.setDate(in7Days.getDate() + 7);

    // Run all counts in parallel
    const [
      overdueInvoices,
      expiringDocuments,
      expiringContracts,
      pendingExtensions,
      expiringGuarantees,
    ] = await Promise.all([
      // Overdue invoices
      Invoice.countDocuments({ status: 'overdue' }),
      // Driver documents expiring within 30 days
      DriverDocument.countDocuments({
        expiryDate: { $gte: now, $lte: in30Days },
        status: { $ne: 'expired' },
      }),
      // Project contracts expiring within 30 days
      ProjectContract.countDocuments({
        endDate: { $gte: now, $lte: in30Days },
        status: 'active',
      }),
      // Pending guarantee extensions
      GuaranteePassport.countDocuments({
        'extensionRequest.status': 'pending',
      }),
      // Guarantees expiring within 7 days
      GuaranteePassport.countDocuments({
        expiryDate: { $gte: now, $lte: in7Days },
        status: { $in: ['active', 'extended'] },
      }),
    ]);

    const total = overdueInvoices + expiringDocuments + expiringContracts + pendingExtensions + expiringGuarantees;

    sendSuccess(res, {
      total,
      breakdown: {
        overdueInvoices,
        expiringDocuments,
        expiringContracts,
        pendingExtensions,
        expiringGuarantees,
      },
    });
  } catch (err) {
    sendError(res, err.message, 500);
  }
});

// ═══════════════════════════════════════════════════════════════════════
// OPERATIONS REPORTS
// ═══════════════════════════════════════════════════════════════════════

// GET /api/reports/ops/driver-availability — driver count by status per project
router.get('/ops/driver-availability', requirePermission('reports.ops_driver_availability'), async (req, res) => {
  try {
    const Driver = getModel(req, 'Driver');
    const Project = getModel(req, 'Project');
    const { projectId } = req.query;

    const matchStage = {};
    if (projectId) {
      const mongoose = require('mongoose');
      matchStage.projectId = new mongoose.Types.ObjectId(projectId);
    }

    const pipeline = [
      { $match: matchStage },
      {
        $group: {
          _id: { projectId: '$projectId', status: '$status' },
          count: { $sum: 1 },
        },
      },
      {
        $group: {
          _id: '$_id.projectId',
          statuses: { $push: { status: '$_id.status', count: '$count' } },
          total: { $sum: '$count' },
        },
      },
      {
        $lookup: {
          from: 'projects',
          localField: '_id',
          foreignField: '_id',
          as: 'project',
        },
      },
      { $unwind: { path: '$project', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          projectId: '$_id',
          projectName: '$project.name',
          statuses: 1,
          total: 1,
        },
      },
      { $sort: { projectName: 1 } },
    ];

    const result = await Driver.aggregate(pipeline);
    sendSuccess(res, result);
  } catch (err) {
    sendError(res, err.message, 500);
  }
});

// GET /api/reports/ops/attendance-tracker — batch approval pipeline status
router.get('/ops/attendance-tracker', requirePermission('reports.ops_attendance_tracker'), async (req, res) => {
  try {
    const AttendanceBatch = getModel(req, 'AttendanceBatch');
    const { year, month } = req.query;

    const matchStage = {};
    if (year) matchStage['period.year'] = parseInt(year);
    if (month) matchStage['period.month'] = parseInt(month);

    const batches = await AttendanceBatch.find(matchStage)
      .populate('projectId', 'name')
      .populate('clientId', 'name')
      .sort({ createdAt: -1 })
      .lean();

    const result = batches.map(b => ({
      batchId: b.batchId,
      _id: b._id,
      projectName: b.projectId?.name,
      clientName: b.clientId?.name,
      period: b.period,
      status: b.status,
      totalRows: b.totalRows,
      matchedRows: b.matchedRows,
      warningRows: b.warningRows,
      errorRows: b.errorRows,
      salesApproval: b.salesApproval?.status || 'pending',
      opsApproval: b.opsApproval?.status || 'pending',
      uploadedBy: b.uploadedByName,
      uploadedAt: b.createdAt,
    }));

    // Summary counts by status
    const summary = {};
    for (const b of result) {
      summary[b.status] = (summary[b.status] || 0) + 1;
    }

    sendSuccess(res, { batches: result, summary });
  } catch (err) {
    sendError(res, err.message, 500);
  }
});

// GET /api/reports/ops/dispute-log — attendance dispute history with turnaround times
router.get('/ops/dispute-log', requirePermission('reports.ops_dispute_log'), async (req, res) => {
  try {
    const AttendanceDispute = getModel(req, 'AttendanceDispute');
    const { status, projectId } = req.query;

    const matchStage = {};
    if (status) matchStage.status = status;
    if (projectId) {
      const mongoose = require('mongoose');
      matchStage.projectId = new mongoose.Types.ObjectId(projectId);
    }

    const disputes = await AttendanceDispute.find(matchStage)
      .populate('batchId', 'batchId period')
      .populate('projectId', 'name')
      .populate('clientId', 'name')
      .sort({ raisedAt: -1 })
      .lean();

    const result = disputes.map(d => {
      const turnaroundMs = d.response?.respondedAt
        ? new Date(d.response.respondedAt) - new Date(d.raisedAt)
        : null;
      return {
        _id: d._id,
        batchRef: d.batchId?.batchId,
        period: d.batchId?.period,
        projectName: d.projectId?.name,
        clientName: d.clientId?.name,
        disputeType: d.disputeType,
        reason: d.reason,
        status: d.status,
        raisedBy: d.raisedByName,
        raisedByRole: d.raisedByRole,
        raisedAt: d.raisedAt,
        respondedAt: d.response?.respondedAt || null,
        respondedBy: d.response?.respondedByName || null,
        turnaroundHours: turnaroundMs ? Math.round(turnaroundMs / (1000 * 60 * 60) * 10) / 10 : null,
        resolvedAt: d.resolvedAt || null,
      };
    });

    sendSuccess(res, result);
  } catch (err) {
    sendError(res, err.message, 500);
  }
});

// GET /api/reports/ops/assignment-history — driver-to-project assignment history
router.get('/ops/assignment-history', requirePermission('reports.ops_assignment_history'), async (req, res) => {
  try {
    const DriverProjectAssignment = getModel(req, 'DriverProjectAssignment');
    const { driverId, projectId, status } = req.query;

    const matchStage = {};
    if (driverId) {
      const mongoose = require('mongoose');
      matchStage.driverId = new mongoose.Types.ObjectId(driverId);
    }
    if (projectId) {
      const mongoose = require('mongoose');
      matchStage.projectId = new mongoose.Types.ObjectId(projectId);
    }
    if (status) matchStage.status = status;

    const assignments = await DriverProjectAssignment.find(matchStage)
      .populate('driverId', 'fullName employeeCode')
      .populate('projectId', 'name')
      .populate('clientId', 'name')
      .sort({ assignedDate: -1 })
      .limit(500)
      .lean();

    const result = assignments.map(a => ({
      _id: a._id,
      driverName: a.driverId?.fullName,
      employeeCode: a.driverId?.employeeCode,
      projectName: a.projectId?.name,
      clientName: a.clientId?.name,
      ratePerDriver: a.ratePerDriver,
      assignedDate: a.assignedDate,
      unassignedDate: a.unassignedDate,
      status: a.status,
      reason: a.reason,
      durationDays: a.unassignedDate
        ? Math.ceil((new Date(a.unassignedDate) - new Date(a.assignedDate)) / (1000 * 60 * 60 * 24))
        : Math.ceil((new Date() - new Date(a.assignedDate)) / (1000 * 60 * 60 * 24)),
    }));

    sendSuccess(res, result);
  } catch (err) {
    sendError(res, err.message, 500);
  }
});

// GET /api/reports/ops/vehicle-utilization — vehicle assignment status and idle tracking
router.get('/ops/vehicle-utilization', requirePermission('reports.ops_vehicle_utilization'), async (req, res) => {
  try {
    const Vehicle = getModel(req, 'Vehicle');
    const { supplierId, status } = req.query;

    const matchStage = {};
    if (supplierId) {
      const mongoose = require('mongoose');
      matchStage.supplierId = new mongoose.Types.ObjectId(supplierId);
    }
    if (status) matchStage.status = status;

    const vehicles = await Vehicle.find(matchStage)
      .populate('supplierId', 'name')
      .populate('currentDriverId', 'fullName employeeCode')
      .sort({ status: 1, plate: 1 })
      .lean();

    const result = vehicles.map(v => ({
      _id: v._id,
      plate: v.plate,
      make: v.make,
      model: v.model,
      vehicleType: v.vehicleType,
      status: v.status,
      supplierName: v.supplierId?.name,
      currentDriver: v.currentDriverId?.fullName || null,
      currentDriverCode: v.currentDriverId?.employeeCode || null,
      monthlyRate: v.monthlyRate,
      totalIdleDays: v.totalIdleDays || 0,
      lastIdleSince: v.lastIdleSince,
      contractEnd: v.contractEnd,
    }));

    // Summary by status
    const summary = {};
    for (const v of result) {
      summary[v.status] = (summary[v.status] || 0) + 1;
    }

    sendSuccess(res, { vehicles: result, summary, total: result.length });
  } catch (err) {
    sendError(res, err.message, 500);
  }
});

// GET /api/reports/ops/vehicle-return — vehicle return conditions and damage trends
router.get('/ops/vehicle-return', requirePermission('reports.ops_vehicle_return'), async (req, res) => {
  try {
    const VehicleAssignment = getModel(req, 'VehicleAssignment');
    const { dateFrom, dateTo } = req.query;

    const matchStage = { status: 'returned' };
    if (dateFrom || dateTo) {
      matchStage.returnedDate = {};
      if (dateFrom) matchStage.returnedDate.$gte = new Date(dateFrom);
      if (dateTo) matchStage.returnedDate.$lte = new Date(dateTo);
    }

    const assignments = await VehicleAssignment.find(matchStage)
      .populate('vehicleId', 'plate make model')
      .populate('driverId', 'fullName employeeCode')
      .sort({ returnedDate: -1 })
      .limit(500)
      .lean();

    const result = assignments.map(a => ({
      _id: a._id,
      vehiclePlate: a.vehicleId?.plate || a.vehiclePlateNumber,
      vehicleMakeModel: a.vehicleId ? `${a.vehicleId.make || ''} ${a.vehicleId.model || ''}`.trim() : a.vehicleMakeModel,
      driverName: a.driverId?.fullName || a.driverName,
      employeeCode: a.driverId?.employeeCode || a.driverEmployeeCode,
      assignedDate: a.assignedDate,
      returnedDate: a.returnedDate,
      returnCondition: a.returnCondition || 'good',
      damageNotes: a.damageNotes,
      damagePenaltyAmount: a.damagePenaltyAmount || 0,
    }));

    // Condition summary
    const conditionSummary = {};
    for (const r of result) {
      conditionSummary[r.returnCondition] = (conditionSummary[r.returnCondition] || 0) + 1;
    }

    sendSuccess(res, { returns: result, conditionSummary, total: result.length });
  } catch (err) {
    sendError(res, err.message, 500);
  }
});

// GET /api/reports/ops/onboarding-pipeline — driver onboarding stages and bottlenecks
router.get('/ops/onboarding-pipeline', requirePermission('reports.ops_onboarding_pipeline'), async (req, res) => {
  try {
    const Driver = getModel(req, 'Driver');

    const onboardingStatuses = ['draft', 'pending_kyc', 'pending_verification'];
    const drivers = await Driver.find({ status: { $in: onboardingStatuses } })
      .populate('clientId', 'name')
      .populate('projectId', 'name')
      .select('fullName employeeCode status clientId projectId createdAt joinDate')
      .sort({ createdAt: -1 })
      .lean();

    const result = drivers.map(d => ({
      _id: d._id,
      fullName: d.fullName,
      employeeCode: d.employeeCode,
      status: d.status,
      clientName: d.clientId?.name,
      projectName: d.projectId?.name,
      createdAt: d.createdAt,
      daysSinceCreated: Math.ceil((new Date() - new Date(d.createdAt)) / (1000 * 60 * 60 * 24)),
    }));

    // Count by stage
    const stageSummary = {};
    for (const s of onboardingStatuses) {
      stageSummary[s] = result.filter(d => d.status === s).length;
    }

    sendSuccess(res, { drivers: result, stageSummary, total: result.length });
  } catch (err) {
    sendError(res, err.message, 500);
  }
});

// GET /api/reports/ops/sim-allocation — SIM card assignments and unallocated SIMs
router.get('/ops/sim-allocation', requirePermission('reports.ops_sim_allocation'), async (req, res) => {
  try {
    const TelecomSim = getModel(req, 'TelecomSim');

    const sims = await TelecomSim.find({})
      .populate('currentDriverId', 'fullName employeeCode')
      .sort({ status: 1, simNumber: 1 })
      .lean();

    const result = sims.map(s => ({
      _id: s._id,
      simNumber: s.simNumber,
      operator: s.operator,
      plan: s.plan,
      monthlyPlanCost: s.monthlyPlanCost,
      status: s.status,
      driverName: s.currentDriverId?.fullName || null,
      employeeCode: s.currentDriverId?.employeeCode || null,
    }));

    const summary = {};
    for (const s of result) {
      summary[s.status] = (summary[s.status] || 0) + 1;
    }

    sendSuccess(res, { sims: result, summary, total: result.length });
  } catch (err) {
    sendError(res, err.message, 500);
  }
});

// GET /api/reports/ops/salary-pipeline — salary run approval stage tracking
router.get('/ops/salary-pipeline', requirePermission('reports.ops_salary_pipeline'), async (req, res) => {
  try {
    const SalaryRun = getModel(req, 'SalaryRun');
    const { year, month } = req.query;

    const matchStage = { isDeleted: { $ne: true } };
    if (year) matchStage['period.year'] = parseInt(year);
    if (month) matchStage['period.month'] = parseInt(month);

    const pipeline = [
      { $match: matchStage },
      {
        $group: {
          _id: { projectId: '$projectId', clientId: '$clientId', status: '$status' },
          count: { $sum: 1 },
          totalGross: { $sum: '$grossSalary' },
          totalNet: { $sum: '$netSalary' },
        },
      },
      {
        $group: {
          _id: { projectId: '$_id.projectId', clientId: '$_id.clientId' },
          stages: { $push: { status: '$_id.status', count: '$count', totalGross: '$totalGross', totalNet: '$totalNet' } },
          totalDrivers: { $sum: '$count' },
        },
      },
      {
        $lookup: { from: 'projects', localField: '_id.projectId', foreignField: '_id', as: 'project' },
      },
      { $unwind: { path: '$project', preserveNullAndEmptyArrays: true } },
      {
        $lookup: { from: 'clients', localField: '_id.clientId', foreignField: '_id', as: 'client' },
      },
      { $unwind: { path: '$client', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          projectName: '$project.name',
          clientName: '$client.name',
          stages: 1,
          totalDrivers: 1,
        },
      },
      { $sort: { clientName: 1, projectName: 1 } },
    ];

    const result = await SalaryRun.aggregate(pipeline);
    sendSuccess(res, result);
  } catch (err) {
    sendError(res, err.message, 500);
  }
});

// GET /api/reports/ops/headcount-vs-plan — actual vs planned driver count per project
router.get('/ops/headcount-vs-plan', requirePermission('reports.ops_headcount_vs_plan'), async (req, res) => {
  try {
    const Project = getModel(req, 'Project');
    const Driver = getModel(req, 'Driver');

    const projects = await Project.find({ status: 'active' })
      .populate('clientId', 'name')
      .lean();

    const result = [];
    for (const proj of projects) {
      const activeCount = await Driver.countDocuments({ projectId: proj._id, status: 'active' });
      const planned = proj.plannedDriverCount || 0;
      result.push({
        _id: proj._id,
        projectName: proj.name,
        clientName: proj.clientId?.name,
        planned,
        actual: activeCount,
        variance: activeCount - planned,
        fillRate: planned > 0 ? Math.round((activeCount / planned) * 100) : null,
      });
    }

    result.sort((a, b) => (a.fillRate || 0) - (b.fillRate || 0));
    sendSuccess(res, result);
  } catch (err) {
    sendError(res, err.message, 500);
  }
});

// ═══════════════════════════════════════════════════════════════════════
// SALES REPORTS
// ═══════════════════════════════════════════════════════════════════════

// GET /api/reports/sales/revenue-by-client — invoiced revenue per client with trends
router.get('/sales/revenue-by-client', requirePermission('reports.sales_revenue_by_client'), async (req, res) => {
  try {
    const Invoice = getModel(req, 'Invoice');
    const { year } = req.query;
    const matchYear = year ? parseInt(year) : new Date().getFullYear();

    const pipeline = [
      {
        $match: {
          status: { $in: ['sent', 'paid', 'overdue'] },
          isDeleted: { $ne: true },
          'period.year': matchYear,
        },
      },
      {
        $group: {
          _id: { clientId: '$clientId', month: '$period.month' },
          revenue: { $sum: '$total' },
          invoiceCount: { $sum: 1 },
        },
      },
      {
        $group: {
          _id: '$_id.clientId',
          months: { $push: { month: '$_id.month', revenue: '$revenue', invoiceCount: '$invoiceCount' } },
          totalRevenue: { $sum: '$revenue' },
          totalInvoices: { $sum: '$invoiceCount' },
        },
      },
      {
        $lookup: { from: 'clients', localField: '_id', foreignField: '_id', as: 'client' },
      },
      { $unwind: '$client' },
      {
        $project: {
          clientId: '$_id',
          clientName: '$client.name',
          months: 1,
          totalRevenue: 1,
          totalInvoices: 1,
        },
      },
      { $sort: { totalRevenue: -1 } },
    ];

    const result = await Invoice.aggregate(pipeline);
    sendSuccess(res, result);
  } catch (err) {
    sendError(res, err.message, 500);
  }
});

// GET /api/reports/sales/client-profitability — revenue minus cost per client (gross margin)
router.get('/sales/client-profitability', requirePermission('reports.sales_client_profitability'), async (req, res) => {
  try {
    const Invoice = getModel(req, 'Invoice');
    const SalaryRun = getModel(req, 'SalaryRun');
    const { year, month } = req.query;

    const matchStage = {};
    if (year) matchStage['period.year'] = parseInt(year);
    if (month) matchStage['period.month'] = parseInt(month);

    // Revenue from invoices
    const revenuePipeline = [
      { $match: { ...matchStage, status: { $in: ['sent', 'paid', 'overdue'] }, isDeleted: { $ne: true } } },
      { $group: { _id: '$clientId', revenue: { $sum: '$total' } } },
    ];

    // Cost from salary runs
    const costPipeline = [
      { $match: { ...matchStage, status: { $in: ['approved', 'paid'] }, isDeleted: { $ne: true } } },
      { $group: { _id: '$clientId', cost: { $sum: '$grossSalary' }, driverCount: { $sum: 1 } } },
    ];

    const [revenueData, costData] = await Promise.all([
      Invoice.aggregate(revenuePipeline),
      SalaryRun.aggregate(costPipeline),
    ]);

    const revenueMap = {};
    for (const r of revenueData) revenueMap[r._id.toString()] = r.revenue;
    const costMap = {};
    const driverMap = {};
    for (const c of costData) {
      costMap[c._id.toString()] = c.cost;
      driverMap[c._id.toString()] = c.driverCount;
    }

    const allClientIds = new Set([...Object.keys(revenueMap), ...Object.keys(costMap)]);
    const Client = getModel(req, 'Client');
    const clients = await Client.find({ _id: { $in: [...allClientIds] } }).select('name').lean();
    const clientNameMap = {};
    for (const c of clients) clientNameMap[c._id.toString()] = c.name;

    const result = [...allClientIds].map(id => {
      const revenue = revenueMap[id] || 0;
      const cost = costMap[id] || 0;
      const margin = revenue - cost;
      return {
        clientId: id,
        clientName: clientNameMap[id] || 'Unknown',
        revenue,
        cost,
        grossMargin: margin,
        marginPercent: revenue > 0 ? Math.round((margin / revenue) * 100 * 10) / 10 : 0,
        driverCount: driverMap[id] || 0,
      };
    }).sort((a, b) => b.grossMargin - a.grossMargin);

    sendSuccess(res, result);
  } catch (err) {
    sendError(res, err.message, 500);
  }
});

// GET /api/reports/sales/credit-note-impact — credit note amounts and impact on revenue per client
router.get('/sales/credit-note-impact', requirePermission('reports.sales_credit_note_impact'), async (req, res) => {
  try {
    const CreditNote = getModel(req, 'CreditNote');
    const Invoice = getModel(req, 'Invoice');
    const { year } = req.query;

    const matchStage = { isDeleted: { $ne: true }, status: { $ne: 'cancelled' } };
    if (year) matchStage['period.year'] = parseInt(year);

    const cnPipeline = [
      { $match: matchStage },
      {
        $group: {
          _id: '$clientId',
          totalCreditNotes: { $sum: '$totalAmount' },
          creditNoteCount: { $sum: 1 },
        },
      },
    ];

    const invMatchStage = { isDeleted: { $ne: true }, status: { $in: ['sent', 'paid', 'overdue'] } };
    if (year) invMatchStage['period.year'] = parseInt(year);

    const invPipeline = [
      { $match: invMatchStage },
      { $group: { _id: '$clientId', totalInvoiced: { $sum: '$total' } } },
    ];

    const [cnData, invData] = await Promise.all([
      CreditNote.aggregate(cnPipeline),
      Invoice.aggregate(invPipeline),
    ]);

    const cnMap = {};
    for (const c of cnData) cnMap[c._id.toString()] = c;
    const invMap = {};
    for (const i of invData) invMap[i._id.toString()] = i.totalInvoiced;

    const allClientIds = new Set([...Object.keys(cnMap), ...Object.keys(invMap)]);
    const Client = getModel(req, 'Client');
    const clients = await Client.find({ _id: { $in: [...allClientIds] } }).select('name').lean();
    const clientNameMap = {};
    for (const c of clients) clientNameMap[c._id.toString()] = c.name;

    const result = [...allClientIds]
      .filter(id => cnMap[id])
      .map(id => {
        const cn = cnMap[id] || {};
        const invoiced = invMap[id] || 0;
        return {
          clientId: id,
          clientName: clientNameMap[id] || 'Unknown',
          totalCreditNotes: cn.totalCreditNotes || 0,
          creditNoteCount: cn.creditNoteCount || 0,
          totalInvoiced: invoiced,
          impactPercent: invoiced > 0 ? Math.round(((cn.totalCreditNotes || 0) / invoiced) * 100 * 10) / 10 : 0,
          netRevenue: invoiced - (cn.totalCreditNotes || 0),
        };
      })
      .sort((a, b) => b.totalCreditNotes - a.totalCreditNotes);

    sendSuccess(res, result);
  } catch (err) {
    sendError(res, err.message, 500);
  }
});

// GET /api/reports/sales/contract-pipeline — contracts expiring in 30/60/90 days
router.get('/sales/contract-pipeline', requirePermission('reports.sales_contract_pipeline'), async (req, res) => {
  try {
    const ProjectContract = getModel(req, 'ProjectContract');
    const now = new Date();
    const in90Days = new Date();
    in90Days.setDate(in90Days.getDate() + 90);

    const contracts = await ProjectContract.find({
      status: 'active',
      endDate: { $gte: now, $lte: in90Days },
    })
      .populate('projectId', 'name')
      .populate('clientId', 'name')
      .sort({ endDate: 1 })
      .lean();

    const result = contracts.map(c => {
      const daysLeft = Math.ceil((new Date(c.endDate) - now) / (1000 * 60 * 60 * 24));
      let bucket;
      if (daysLeft <= 30) bucket = '0-30 days';
      else if (daysLeft <= 60) bucket = '31-60 days';
      else bucket = '61-90 days';

      return {
        _id: c._id,
        contractNumber: c.contractNumber,
        projectName: c.projectId?.name,
        clientName: c.clientId?.name,
        contractType: c.contractType,
        ratePerDriver: c.ratePerDriver,
        rateBasis: c.rateBasis,
        startDate: c.startDate,
        endDate: c.endDate,
        daysLeft,
        bucket,
      };
    });

    const bucketSummary = {
      '0-30 days': result.filter(r => r.bucket === '0-30 days').length,
      '31-60 days': result.filter(r => r.bucket === '31-60 days').length,
      '61-90 days': result.filter(r => r.bucket === '61-90 days').length,
    };

    sendSuccess(res, { contracts: result, bucketSummary, total: result.length });
  } catch (err) {
    sendError(res, err.message, 500);
  }
});

// GET /api/reports/sales/fill-rate — active vs planned headcount fill rate
router.get('/sales/fill-rate', requirePermission('reports.sales_fill_rate'), async (req, res) => {
  try {
    const Project = getModel(req, 'Project');
    const Driver = getModel(req, 'Driver');

    const projects = await Project.find({ status: 'active' })
      .populate('clientId', 'name')
      .lean();

    const result = [];
    for (const proj of projects) {
      const activeCount = await Driver.countDocuments({ projectId: proj._id, status: 'active' });
      const planned = proj.plannedDriverCount || 0;
      result.push({
        _id: proj._id,
        projectName: proj.name,
        clientName: proj.clientId?.name,
        planned,
        active: activeCount,
        fillRate: planned > 0 ? Math.round((activeCount / planned) * 100) : null,
        gap: planned - activeCount,
      });
    }

    result.sort((a, b) => (a.fillRate || 0) - (b.fillRate || 0));
    sendSuccess(res, result);
  } catch (err) {
    sendError(res, err.message, 500);
  }
});

// GET /api/reports/sales/new-drivers — drivers added per client/project per period
router.get('/sales/new-drivers', requirePermission('reports.sales_new_drivers'), async (req, res) => {
  try {
    const Driver = getModel(req, 'Driver');
    const { dateFrom, dateTo } = req.query;

    const matchStage = {};
    if (dateFrom || dateTo) {
      matchStage.createdAt = {};
      if (dateFrom) matchStage.createdAt.$gte = new Date(dateFrom);
      if (dateTo) matchStage.createdAt.$lte = new Date(dateTo);
    }

    const pipeline = [
      { $match: matchStage },
      {
        $group: {
          _id: { clientId: '$clientId', projectId: '$projectId' },
          count: { $sum: 1 },
          drivers: {
            $push: {
              fullName: '$fullName',
              employeeCode: '$employeeCode',
              status: '$status',
              createdAt: '$createdAt',
            },
          },
        },
      },
      {
        $lookup: { from: 'clients', localField: '_id.clientId', foreignField: '_id', as: 'client' },
      },
      { $unwind: { path: '$client', preserveNullAndEmptyArrays: true } },
      {
        $lookup: { from: 'projects', localField: '_id.projectId', foreignField: '_id', as: 'project' },
      },
      { $unwind: { path: '$project', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          clientName: '$client.name',
          projectName: '$project.name',
          count: 1,
          drivers: 1,
        },
      },
      { $sort: { count: -1 } },
    ];

    const result = await Driver.aggregate(pipeline);
    sendSuccess(res, result);
  } catch (err) {
    sendError(res, err.message, 500);
  }
});

// GET /api/reports/sales/rate-comparison — rate per driver across projects per client
router.get('/sales/rate-comparison', requirePermission('reports.sales_rate_comparison'), async (req, res) => {
  try {
    const Project = getModel(req, 'Project');
    const Driver = getModel(req, 'Driver');

    const projects = await Project.find({ status: 'active' })
      .populate('clientId', 'name')
      .lean();

    const result = [];
    for (const proj of projects) {
      const activeCount = await Driver.countDocuments({ projectId: proj._id, status: 'active' });
      result.push({
        _id: proj._id,
        projectName: proj.name,
        clientName: proj.clientId?.name,
        clientId: proj.clientId?._id,
        ratePerDriver: proj.ratePerDriver,
        rateBasis: proj.rateBasis,
        currency: proj.currency,
        activeDrivers: activeCount,
        monthlyValue: proj.rateBasis === 'monthly_fixed' ? proj.ratePerDriver * activeCount : null,
      });
    }

    // Group by client
    const byClient = {};
    for (const r of result) {
      const key = r.clientId?.toString() || 'unknown';
      if (!byClient[key]) byClient[key] = { clientName: r.clientName, projects: [] };
      byClient[key].projects.push(r);
    }

    sendSuccess(res, Object.values(byClient));
  } catch (err) {
    sendError(res, err.message, 500);
  }
});

// =============================================
// OPERATIONS REPORT ENDPOINTS (V2)
// =============================================

// GET /api/reports/driver-availability — driver count by status per project with fill rate
router.get('/driver-availability', requirePermission('reports.ops_driver_availability'), async (req, res) => {
  try {
    const Driver = getModel(req, 'Driver');
    const Project = getModel(req, 'Project');
    const mongoose = require('mongoose');
    const { projectId } = req.query;

    const driverMatch = {};
    if (projectId) driverMatch.projectId = new mongoose.Types.ObjectId(projectId);

    const pipeline = [
      { $match: driverMatch },
      {
        $group: {
          _id: { projectId: '$projectId', status: '$status' },
          count: { $sum: 1 },
        },
      },
      {
        $group: {
          _id: '$_id.projectId',
          statusCounts: { $push: { k: '$_id.status', v: '$count' } },
          totalActive: {
            $sum: {
              $cond: [{ $eq: ['$_id.status', 'active'] }, '$count', 0],
            },
          },
        },
      },
      {
        $lookup: {
          from: 'projects',
          localField: '_id',
          foreignField: '_id',
          as: 'project',
        },
      },
      { $unwind: { path: '$project', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: 'clients',
          localField: 'project.clientId',
          foreignField: '_id',
          as: 'client',
        },
      },
      { $unwind: { path: '$client', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          projectId: '$_id',
          projectName: '$project.name',
          clientName: '$client.name',
          statusCounts: { $arrayToObject: '$statusCounts' },
          totalActive: 1,
          planned: { $ifNull: ['$project.plannedDriverCount', 0] },
        },
      },
      {
        $addFields: {
          fillRate: {
            $cond: [
              { $gt: ['$planned', 0] },
              { $multiply: [{ $divide: ['$totalActive', '$planned'] }, 100] },
              null,
            ],
          },
        },
      },
      { $sort: { projectName: 1 } },
    ];

    const result = await Driver.aggregate(pipeline);
    sendSuccess(res, result);
  } catch (err) {
    sendError(res, err.message, 500);
  }
});

// GET /api/reports/attendance-tracker — batch approval status per project
router.get('/attendance-tracker', requirePermission('reports.ops_attendance_tracker'), async (req, res) => {
  try {
    const AttendanceBatch = getModel(req, 'AttendanceBatch');
    const { year, month } = req.query;

    const matchStage = {};
    if (year) matchStage['period.year'] = parseInt(year);
    if (month) matchStage['period.month'] = parseInt(month);

    const batches = await AttendanceBatch.find(matchStage)
      .populate('projectId', 'name')
      .populate('clientId', 'name')
      .sort({ createdAt: -1 })
      .lean();

    const result = batches.map(b => ({
      projectId: b.projectId?._id,
      projectName: b.projectId?.name,
      clientName: b.clientId?.name,
      batchId: b.batchId,
      status: b.status,
      salesApproval: { status: b.salesApproval?.status || 'pending' },
      opsApproval: { status: b.opsApproval?.status || 'pending' },
      hasDisputes: Array.isArray(b.disputes) && b.disputes.length > 0,
      uploadedAt: b.createdAt,
    }));

    sendSuccess(res, result);
  } catch (err) {
    sendError(res, err.message, 500);
  }
});

// GET /api/reports/dispute-log — attendance disputes with turnaround time
router.get('/dispute-log', requirePermission('reports.ops_dispute_log'), async (req, res) => {
  try {
    const AttendanceDispute = getModel(req, 'AttendanceDispute');
    const { year, month, status } = req.query;

    const matchStage = {};
    if (status) matchStage.status = status;

    // Filter by year/month via batch period lookup
    if (year || month) {
      const AttendanceBatch = getModel(req, 'AttendanceBatch');
      const batchMatch = {};
      if (year) batchMatch['period.year'] = parseInt(year);
      if (month) batchMatch['period.month'] = parseInt(month);
      const batchIds = await AttendanceBatch.find(batchMatch).distinct('_id');
      matchStage.batchId = { $in: batchIds };
    }

    const disputes = await AttendanceDispute.find(matchStage)
      .populate('batchId', 'batchId period')
      .populate('projectId', 'name')
      .populate('clientId', 'name')
      .sort({ raisedAt: -1 })
      .lean();

    const result = disputes.map(d => {
      const responseTimeMs = d.response?.respondedAt
        ? new Date(d.response.respondedAt) - new Date(d.raisedAt)
        : null;
      return {
        disputeId: d._id,
        batchId: d.batchId?.batchId,
        projectName: d.projectId?.name,
        clientName: d.clientId?.name,
        disputeType: d.disputeType,
        reason: d.reason,
        raisedByName: d.raisedByName,
        raisedAt: d.raisedAt,
        status: d.status,
        responseTime: responseTimeMs ? Math.round(responseTimeMs / (1000 * 60 * 60) * 10) / 10 : null,
        resolvedAt: d.resolvedAt || null,
      };
    });

    sendSuccess(res, result);
  } catch (err) {
    sendError(res, err.message, 500);
  }
});

// GET /api/reports/assignment-history — driver/project assignment records
router.get('/assignment-history', requirePermission('reports.ops_assignment_history'), async (req, res) => {
  try {
    const DriverProjectAssignment = getModel(req, 'DriverProjectAssignment');
    const mongoose = require('mongoose');
    const { driverId, projectId } = req.query;

    if (!driverId && !projectId) {
      return sendError(res, 'At least one of driverId or projectId is required', 400);
    }

    const matchStage = {};
    if (driverId) matchStage.driverId = new mongoose.Types.ObjectId(driverId);
    if (projectId) matchStage.projectId = new mongoose.Types.ObjectId(projectId);

    const assignments = await DriverProjectAssignment.find(matchStage)
      .populate('driverId', 'fullName employeeCode')
      .populate('projectId', 'name')
      .populate('clientId', 'name')
      .sort({ assignedDate: -1 })
      .lean();

    const result = assignments.map(a => ({
      driverId: a.driverId?._id,
      driverName: a.driverId?.fullName,
      employeeCode: a.driverId?.employeeCode,
      projectName: a.projectId?.name,
      clientName: a.clientId?.name,
      ratePerDriver: a.ratePerDriver,
      assignedDate: a.assignedDate,
      unassignedDate: a.unassignedDate || null,
      status: a.status,
      reason: a.reason || null,
    }));

    sendSuccess(res, result);
  } catch (err) {
    sendError(res, err.message, 500);
  }
});

// GET /api/reports/vehicle-return-condition — returned vehicles with damage summary
router.get('/vehicle-return-condition', requirePermission('reports.ops_vehicle_return'), async (req, res) => {
  try {
    const VehicleAssignment = getModel(req, 'VehicleAssignment');
    const { year, month } = req.query;

    const matchStage = { status: 'returned' };
    if (year && month) {
      const start = new Date(parseInt(year), parseInt(month) - 1, 1);
      const end = new Date(parseInt(year), parseInt(month), 0, 23, 59, 59, 999);
      matchStage.returnedDate = { $gte: start, $lte: end };
    }

    const assignments = await VehicleAssignment.find(matchStage)
      .sort({ returnedDate: -1 })
      .lean();

    const returns = assignments.map(a => ({
      vehiclePlate: a.vehiclePlateNumber,
      vehicleMakeModel: a.vehicleMakeModel,
      driverName: a.driverName,
      returnCondition: a.returnCondition || 'good',
      damageNotes: a.damageNotes || null,
      damagePenaltyAmount: a.damagePenaltyAmount || 0,
      returnedDate: a.returnedDate,
      returnedByName: a.returnedByName || null,
    }));

    const summary = {
      total: returns.length,
      good: returns.filter(r => r.returnCondition === 'good').length,
      minor_damage: returns.filter(r => r.returnCondition === 'minor_damage').length,
      major_damage: returns.filter(r => r.returnCondition === 'major_damage').length,
      total_loss: returns.filter(r => r.returnCondition === 'total_loss').length,
      totalPenalties: returns.reduce((sum, r) => sum + (r.damagePenaltyAmount || 0), 0),
    };

    sendSuccess(res, { returns, summary });
  } catch (err) {
    sendError(res, err.message, 500);
  }
});

// GET /api/reports/onboarding-pipeline — drivers in onboarding with missing docs
router.get('/onboarding-pipeline', requirePermission('reports.ops_onboarding_pipeline'), async (req, res) => {
  try {
    const Driver = getModel(req, 'Driver');
    const DriverDocument = getModel(req, 'DriverDocument');

    const onboardingStatuses = ['draft', 'pending_kyc', 'pending_verification'];
    const drivers = await Driver.find({ status: { $in: onboardingStatuses } })
      .select('fullName employeeCode status lastStatusChange createdAt contactsVerified personalVerificationDone')
      .sort({ createdAt: -1 })
      .lean();

    const requiredDocTypes = ['emirates_id', 'passport', 'visa', 'labour_card'];
    const now = new Date();

    const result = await Promise.all(drivers.map(async (d) => {
      const docs = await DriverDocument.find({ driverId: d._id }).lean();
      const existingTypes = new Set(docs.filter(doc => doc.status !== 'expired' && (!doc.expiryDate || new Date(doc.expiryDate) > now)).map(doc => doc.docType));
      const missingDocs = requiredDocTypes.filter(t => !existingTypes.has(t));

      const statusChangeDate = d.lastStatusChange?.changedAt || d.createdAt;
      const daysInStatus = Math.ceil((now - new Date(statusChangeDate)) / (1000 * 60 * 60 * 24));

      return {
        driverId: d._id,
        fullName: d.fullName,
        employeeCode: d.employeeCode,
        status: d.status,
        daysInStatus,
        createdAt: d.createdAt,
        missingDocs,
        contactsVerified: d.contactsVerified || false,
        personalVerificationDone: d.personalVerificationDone || false,
      };
    }));

    sendSuccess(res, result);
  } catch (err) {
    sendError(res, err.message, 500);
  }
});

// GET /api/reports/sim-allocation — placeholder until TelecomSim model is connected
router.get('/sim-allocation', requirePermission('reports.ops_sim_allocation'), async (req, res) => {
  try {
    sendSuccess(res, { message: 'SIM Card module not yet integrated. This report will be available once the TelecomSim model is connected.' });
  } catch (err) {
    sendError(res, err.message, 500);
  }
});

// GET /api/reports/salary-pipeline — salary run status grouped by stage and project
router.get('/salary-pipeline', requirePermission('reports.ops_salary_pipeline'), async (req, res) => {
  try {
    const SalaryRun = getModel(req, 'SalaryRun');
    const { year, month } = req.query;

    const matchStage = { isDeleted: { $ne: true } };
    if (year) matchStage['period.year'] = parseInt(year);
    if (month) matchStage['period.month'] = parseInt(month);

    const pipeline = [
      { $match: matchStage },
      {
        $facet: {
          byStatus: [
            { $group: { _id: '$status', count: { $sum: 1 } } },
          ],
          byProject: [
            {
              $group: {
                _id: { projectId: '$projectId', clientId: '$clientId', status: '$status' },
                count: { $sum: 1 },
              },
            },
            {
              $group: {
                _id: { projectId: '$_id.projectId', clientId: '$_id.clientId' },
                statusCounts: { $push: { k: '$_id.status', v: '$count' } },
              },
            },
            {
              $lookup: { from: 'projects', localField: '_id.projectId', foreignField: '_id', as: 'project' },
            },
            { $unwind: { path: '$project', preserveNullAndEmptyArrays: true } },
            {
              $lookup: { from: 'clients', localField: '_id.clientId', foreignField: '_id', as: 'client' },
            },
            { $unwind: { path: '$client', preserveNullAndEmptyArrays: true } },
            {
              $project: {
                projectId: '$_id.projectId',
                projectName: '$project.name',
                clientName: '$client.name',
                statusCounts: { $arrayToObject: '$statusCounts' },
              },
            },
            { $sort: { clientName: 1, projectName: 1 } },
          ],
          total: [
            { $count: 'count' },
          ],
        },
      },
    ];

    const [facetResult] = await SalaryRun.aggregate(pipeline);

    const byStatus = {};
    for (const s of facetResult.byStatus) {
      byStatus[s._id] = s.count;
    }

    const period = year && month ? `${year}-${String(month).padStart(2, '0')}` : 'all';

    sendSuccess(res, {
      byStatus,
      byProject: facetResult.byProject,
      total: facetResult.total[0]?.count || 0,
      period,
    });
  } catch (err) {
    sendError(res, err.message, 500);
  }
});

// GET /api/reports/headcount-vs-plan — actual vs planned driver headcount per project
router.get('/headcount-vs-plan', requirePermission('reports.ops_headcount_vs_plan'), async (req, res) => {
  try {
    const Project = getModel(req, 'Project');
    const Driver = getModel(req, 'Driver');

    const projects = await Project.find({ status: 'active' })
      .populate('clientId', 'name')
      .lean();

    const result = [];
    for (const proj of projects) {
      const actual = await Driver.countDocuments({ projectId: proj._id, status: 'active' });
      const planned = proj.plannedDriverCount || 0;
      result.push({
        projectId: proj._id,
        projectName: proj.name,
        clientName: proj.clientId?.name,
        planned,
        actual,
        fillRate: planned > 0 ? (actual / planned * 100).toFixed(1) : null,
        gap: planned - actual,
      });
    }

    sendSuccess(res, result);
  } catch (err) {
    sendError(res, err.message, 500);
  }
});

module.exports = router;
