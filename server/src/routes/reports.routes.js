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

// =============================================
// SALES REPORT ENDPOINTS (Task 3)
// =============================================

// GET /api/reports/revenue-by-client
router.get('/revenue-by-client', requirePermission('reports.sales_revenue_by_client'), async (req, res) => {
  try {
    const Invoice = getModel(req, 'Invoice');
    const mongoose = require('mongoose');
    const { year, month, clientId } = req.query;
    if (!year) return sendError(res, 'year is required', 400);

    const matchStage = {
      isDeleted: { $ne: true },
      status: { $ne: 'cancelled' },
      'period.year': parseInt(year),
    };
    if (month) matchStage['period.month'] = parseInt(month);
    if (clientId) matchStage.clientId = new mongoose.Types.ObjectId(clientId);

    const groupId = month
      ? { clientId: '$clientId', year: '$period.year', month: '$period.month' }
      : { clientId: '$clientId', year: '$period.year', month: '$period.month' };

    const pipeline = [
      { $match: matchStage },
      {
        $group: {
          _id: groupId,
          subtotal: { $sum: '$subtotal' },
          vat: { $sum: '$vatAmount' },
          total: { $sum: '$total' },
          invoiceCount: { $sum: 1 },
        },
      },
      {
        $lookup: { from: 'clients', localField: '_id.clientId', foreignField: '_id', as: 'client' },
      },
      { $unwind: '$client' },
      {
        $project: {
          _id: 0,
          clientId: '$_id.clientId',
          clientName: '$client.name',
          period: { year: '$_id.year', month: '$_id.month' },
          subtotal: 1,
          vat: 1,
          total: 1,
          invoiceCount: 1,
        },
      },
      { $sort: { 'clientName': 1, 'period.month': 1 } },
    ];

    const result = await Invoice.aggregate(pipeline);
    sendSuccess(res, result);
  } catch (err) {
    sendError(res, err.message, 500);
  }
});

// GET /api/reports/client-profitability
router.get('/client-profitability', requirePermission('reports.sales_client_profitability'), async (req, res) => {
  try {
    const Invoice = getModel(req, 'Invoice');
    const SalaryRun = getModel(req, 'SalaryRun');
    const Client = getModel(req, 'Client');
    const { year, month } = req.query;
    if (!year) return sendError(res, 'year is required', 400);

    const periodMatch = { 'period.year': parseInt(year) };
    if (month) periodMatch['period.month'] = parseInt(month);

    const [revenueData, costData] = await Promise.all([
      Invoice.aggregate([
        { $match: { ...periodMatch, isDeleted: { $ne: true }, status: { $ne: 'cancelled' } } },
        { $group: { _id: '$clientId', revenue: { $sum: '$total' } } },
      ]),
      SalaryRun.aggregate([
        { $match: { ...periodMatch, isDeleted: { $ne: true } } },
        { $group: { _id: '$clientId', salaryCost: { $sum: '$grossSalary' }, driverCount: { $sum: 1 } } },
      ]),
    ]);

    const revenueMap = {};
    for (const r of revenueData) revenueMap[r._id.toString()] = r.revenue;
    const costMap = {};
    const driverMap = {};
    for (const c of costData) {
      costMap[c._id.toString()] = c.salaryCost;
      driverMap[c._id.toString()] = c.driverCount;
    }

    const allClientIds = [...new Set([...Object.keys(revenueMap), ...Object.keys(costMap)])];
    const clients = await Client.find({ _id: { $in: allClientIds } }).select('name').lean();
    const clientNameMap = {};
    for (const c of clients) clientNameMap[c._id.toString()] = c.name;

    const result = allClientIds.map(id => {
      const revenue = revenueMap[id] || 0;
      const salaryCost = costMap[id] || 0;
      const grossMargin = revenue - salaryCost;
      return {
        clientId: id,
        clientName: clientNameMap[id] || 'Unknown',
        revenue,
        salaryCost,
        grossMargin,
        marginPercent: revenue > 0 ? Math.round((grossMargin / revenue) * 1000) / 10 : 0,
        driverCount: driverMap[id] || 0,
      };
    }).sort((a, b) => b.grossMargin - a.grossMargin);

    sendSuccess(res, result);
  } catch (err) {
    sendError(res, err.message, 500);
  }
});

// GET /api/reports/credit-note-impact
router.get('/credit-note-impact', requirePermission('reports.sales_credit_note_impact'), async (req, res) => {
  try {
    const CreditNote = getModel(req, 'CreditNote');
    const Invoice = getModel(req, 'Invoice');
    const Client = getModel(req, 'Client');
    const { year, month } = req.query;

    const matchStage = { isDeleted: { $ne: true } };
    if (year) matchStage['period.year'] = parseInt(year);
    if (month) matchStage['period.month'] = parseInt(month);

    // Credit notes grouped by client with noteType breakdown
    const cnPipeline = [
      { $match: matchStage },
      { $unwind: '$lineItems' },
      {
        $group: {
          _id: { clientId: '$clientId', noteType: '$lineItems.noteType' },
          amount: { $sum: '$lineItems.totalWithVat' },
        },
      },
      {
        $group: {
          _id: '$_id.clientId',
          byType: { $push: { noteType: '$_id.noteType', amount: '$amount' } },
          totalAmount: { $sum: '$amount' },
        },
      },
    ];

    // Total credit note count per client
    const cnCountPipeline = [
      { $match: matchStage },
      { $group: { _id: '$clientId', totalCreditNotes: { $sum: 1 } } },
    ];

    // Invoiced revenue per client
    const invMatchStage = { isDeleted: { $ne: true }, status: { $ne: 'cancelled' } };
    if (year) invMatchStage['period.year'] = parseInt(year);
    if (month) invMatchStage['period.month'] = parseInt(month);

    const [cnData, cnCountData, invData] = await Promise.all([
      CreditNote.aggregate(cnPipeline),
      CreditNote.aggregate(cnCountPipeline),
      Invoice.aggregate([
        { $match: invMatchStage },
        { $group: { _id: '$clientId', invoicedRevenue: { $sum: '$total' } } },
      ]),
    ]);

    const cnMap = {};
    for (const c of cnData) {
      const byTypeObj = {};
      for (const t of c.byType) byTypeObj[t.noteType] = t.amount;
      cnMap[c._id.toString()] = { totalAmount: c.totalAmount, byType: byTypeObj };
    }
    const cnCountMap = {};
    for (const c of cnCountData) cnCountMap[c._id.toString()] = c.totalCreditNotes;
    const invMap = {};
    for (const i of invData) invMap[i._id.toString()] = i.invoicedRevenue;

    const allClientIds = [...new Set([...Object.keys(cnMap), ...Object.keys(invMap)])];
    const clients = await Client.find({ _id: { $in: allClientIds } }).select('name').lean();
    const clientNameMap = {};
    for (const c of clients) clientNameMap[c._id.toString()] = c.name;

    const result = allClientIds
      .filter(id => cnMap[id])
      .map(id => {
        const cn = cnMap[id];
        const invoicedRevenue = invMap[id] || 0;
        return {
          clientId: id,
          clientName: clientNameMap[id] || 'Unknown',
          totalCreditNotes: cnCountMap[id] || 0,
          totalAmount: cn.totalAmount,
          byType: cn.byType,
          invoicedRevenue,
          cnToRevenueRatio: invoicedRevenue > 0 ? Math.round((cn.totalAmount / invoicedRevenue) * 1000) / 10 : 0,
        };
      })
      .sort((a, b) => b.totalAmount - a.totalAmount);

    sendSuccess(res, result);
  } catch (err) {
    sendError(res, err.message, 500);
  }
});

// GET /api/reports/contract-pipeline
router.get('/contract-pipeline', requirePermission('reports.sales_contract_pipeline'), async (req, res) => {
  try {
    const ProjectContract = getModel(req, 'ProjectContract');
    const days = parseInt(req.query.days) || 90;
    const now = new Date();
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + days);

    const contracts = await ProjectContract.find({
      status: 'active',
      endDate: { $gte: now, $lte: futureDate },
    })
      .populate('projectId', 'name')
      .populate('clientId', 'name')
      .sort({ endDate: 1 })
      .lean();

    const result = contracts.map(c => {
      const daysUntilExpiry = Math.ceil((new Date(c.endDate) - now) / (1000 * 60 * 60 * 24));
      return {
        contractId: c._id,
        projectName: c.projectId?.name || 'Unknown',
        clientName: c.clientId?.name || 'Unknown',
        contractType: c.contractType,
        startDate: c.startDate,
        endDate: c.endDate,
        daysUntilExpiry,
        ratePerDriver: c.ratePerDriver,
        rateBasis: c.rateBasis,
        status: c.status,
      };
    });

    sendSuccess(res, result);
  } catch (err) {
    sendError(res, err.message, 500);
  }
});

// GET /api/reports/fill-rate
router.get('/fill-rate', requirePermission('reports.sales_fill_rate'), async (req, res) => {
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
      const ratePerDriver = proj.ratePerDriver || 0;
      const fillRate = planned > 0 ? Math.round((actual / planned) * 100) : null;
      const gap = planned - actual;

      result.push({
        projectId: proj._id,
        projectName: proj.name,
        clientName: proj.clientId?.name || 'Unknown',
        planned,
        actual,
        fillRate,
        gap,
        ratePerDriver,
        potentialMonthlyRevenue: planned * ratePerDriver,
        actualMonthlyRevenue: actual * ratePerDriver,
        revenueGap: gap * ratePerDriver,
      });
    }

    result.sort((a, b) => (a.fillRate || 0) - (b.fillRate || 0));
    sendSuccess(res, result);
  } catch (err) {
    sendError(res, err.message, 500);
  }
});

// GET /api/reports/new-drivers
router.get('/new-drivers', requirePermission('reports.sales_new_drivers'), async (req, res) => {
  try {
    const Driver = getModel(req, 'Driver');
    const { year, month } = req.query;
    if (!year || !month) return sendError(res, 'year and month are required', 400);

    const y = parseInt(year);
    const m = parseInt(month);
    const startDate = new Date(y, m - 1, 1);
    const endDate = new Date(y, m, 1);

    const pipeline = [
      { $match: { createdAt: { $gte: startDate, $lt: endDate } } },
      {
        $group: {
          _id: { clientId: '$clientId', projectId: '$projectId' },
          count: { $sum: 1 },
          newDrivers: {
            $push: {
              driverId: '$_id',
              fullName: '$fullName',
              employeeCode: '$employeeCode',
              joinDate: '$joinDate',
              status: '$status',
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
          _id: 0,
          clientId: '$_id.clientId',
          clientName: '$client.name',
          projectId: '$_id.projectId',
          projectName: '$project.name',
          newDrivers: 1,
          count: 1,
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

// GET /api/reports/rate-comparison
router.get('/rate-comparison', requirePermission('reports.sales_rate_comparison'), async (req, res) => {
  try {
    const Project = getModel(req, 'Project');
    const Driver = getModel(req, 'Driver');

    const projects = await Project.find({ status: 'active' })
      .populate('clientId', 'name')
      .sort({ 'clientId.name': 1 })
      .lean();

    const byClient = {};
    for (const proj of projects) {
      const activeDrivers = await Driver.countDocuments({ projectId: proj._id, status: 'active' });
      const clientKey = proj.clientId?._id?.toString() || 'unknown';

      if (!byClient[clientKey]) {
        byClient[clientKey] = {
          clientId: proj.clientId?._id,
          clientName: proj.clientId?.name || 'Unknown',
          projects: [],
        };
      }

      byClient[clientKey].projects.push({
        projectId: proj._id,
        projectName: proj.name,
        ratePerDriver: proj.ratePerDriver,
        rateBasis: proj.rateBasis,
        currency: proj.currency,
        activeDrivers,
      });
    }

    const result = Object.values(byClient).sort((a, b) => a.clientName.localeCompare(b.clientName));
    sendSuccess(res, result);
  } catch (err) {
    sendError(res, err.message, 500);
  }
});

// =====================================================
// COMPLIANCE / HR ENDPOINTS
// =====================================================

// GET /api/reports/kyc-compliance — KYC compliance rate per client
router.get('/kyc-compliance', requirePermission('reports.compliance_kyc_status'), async (req, res) => {
  try {
    const Client = getModel(req, 'Client');
    const Driver = getModel(req, 'Driver');
    const DriverDocument = getModel(req, 'DriverDocument');

    const clients = await Client.find({ isActive: true, kycRules: { $exists: true } }).lean();
    const result = [];

    for (const client of clients) {
      const rules = client.kycRules || {};
      const requiredDocTypes = [];
      if (rules.requireEmiratesId) requiredDocTypes.push('emirates_id');
      if (rules.requirePassport) requiredDocTypes.push('passport');
      if (rules.requireVisa) requiredDocTypes.push('visa');
      if (rules.requireLabourCard) requiredDocTypes.push('labour_card');

      if (requiredDocTypes.length === 0) continue;

      const drivers = await Driver.find({ clientId: client._id, status: 'active' }).lean();
      const totalDrivers = drivers.length;
      let compliantDrivers = 0;
      const nonCompliantDrivers = [];

      for (const driver of drivers) {
        const docs = await DriverDocument.find({
          driverId: driver._id,
          docType: { $in: requiredDocTypes },
          status: { $in: ['verified', 'pending'] },
          $or: [
            { expiryDate: { $exists: false } },
            { expiryDate: null },
            { expiryDate: { $gte: new Date() } },
          ],
        }).lean();

        const presentDocTypes = docs.map(d => d.docType);
        const missingDocs = requiredDocTypes.filter(dt => !presentDocTypes.includes(dt));

        if (missingDocs.length === 0) {
          compliantDrivers++;
        } else {
          nonCompliantDrivers.push({
            driverId: driver._id,
            fullName: driver.fullName,
            employeeCode: driver.employeeCode,
            missingDocs,
          });
        }
      }

      result.push({
        clientId: client._id,
        clientName: client.name,
        kycRules: rules,
        totalDrivers,
        compliantDrivers,
        complianceRate: totalDrivers > 0 ? Math.round((compliantDrivers / totalDrivers) * 10000) / 100 : 0,
        nonCompliantDrivers,
      });
    }

    sendSuccess(res, result);
  } catch (err) {
    sendError(res, err.message, 500);
  }
});

// GET /api/reports/status-transitions — driver status change history
router.get('/status-transitions', requirePermission('reports.compliance_status_transitions'), async (req, res) => {
  try {
    const DriverHistory = getModel(req, 'DriverHistory');
    const { year, month } = req.query;

    const match = { eventType: 'status_change' };
    if (year && month) {
      const startDate = new Date(parseInt(year), parseInt(month) - 1, 1);
      const endDate = new Date(parseInt(year), parseInt(month), 1);
      match.createdAt = { $gte: startDate, $lt: endDate };
    } else if (year) {
      const startDate = new Date(parseInt(year), 0, 1);
      const endDate = new Date(parseInt(year) + 1, 0, 1);
      match.createdAt = { $gte: startDate, $lt: endDate };
    }

    const transitions = await DriverHistory.find(match)
      .populate('driverId', 'fullName employeeCode')
      .sort({ createdAt: -1 })
      .lean();

    const records = transitions.map(t => ({
      driverId: t.driverId?._id || t.driverId,
      driverName: t.driverId?.fullName,
      employeeCode: t.driverId?.employeeCode,
      statusFrom: t.statusFrom,
      statusTo: t.statusTo,
      reason: t.reason,
      performedByName: t.performedByName,
      performedByRole: t.performedByRole,
      createdAt: t.createdAt,
    }));

    // Build summary
    const byTransition = {};
    for (const r of records) {
      const key = `${r.statusFrom || 'unknown'}→${r.statusTo || 'unknown'}`;
      byTransition[key] = (byTransition[key] || 0) + 1;
    }

    sendSuccess(res, {
      summary: {
        totalTransitions: records.length,
        byTransition,
      },
      transitions: records,
    });
  } catch (err) {
    sendError(res, err.message, 500);
  }
});

// GET /api/reports/workforce-headcount — driver headcount by status, nationality, client
router.get('/workforce-headcount', requirePermission('reports.compliance_headcount'), async (req, res) => {
  try {
    const Driver = getModel(req, 'Driver');

    const [byStatus, byNationality, byClient, total] = await Promise.all([
      Driver.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      Driver.aggregate([
        { $match: { nationality: { $exists: true, $ne: null, $ne: '' } } },
        { $group: { _id: '$nationality', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      Driver.aggregate([
        { $match: { clientId: { $exists: true, $ne: null } } },
        { $group: { _id: '$clientId', count: { $sum: 1 } } },
        {
          $lookup: {
            from: 'clients',
            localField: '_id',
            foreignField: '_id',
            as: 'client',
          },
        },
        { $unwind: { path: '$client', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            clientId: '$_id',
            clientName: { $ifNull: ['$client.name', 'Unknown'] },
            count: 1,
          },
        },
        { $sort: { count: -1 } },
      ]),
      Driver.countDocuments(),
    ]);

    const statusMap = {};
    for (const s of byStatus) {
      statusMap[s._id || 'unknown'] = s.count;
    }

    sendSuccess(res, {
      byStatus: statusMap,
      byNationality: byNationality.map(n => ({ nationality: n._id, count: n.count })),
      byClient: byClient.map(c => ({ clientId: c.clientId, clientName: c.clientName, count: c.count })),
      total,
    });
  } catch (err) {
    sendError(res, err.message, 500);
  }
});

// GET /api/reports/verification-audit — drivers pending verification
router.get('/verification-audit', requirePermission('reports.compliance_verification'), async (req, res) => {
  try {
    const Driver = getModel(req, 'Driver');
    const now = new Date();

    const drivers = await Driver.find({
      $or: [
        { status: { $in: ['pending_kyc', 'pending_verification'] } },
        { contactsVerified: false },
        { personalVerificationDone: false },
      ],
    })
      .populate('contactsVerifiedBy', 'name')
      .populate('personalVerificationBy', 'name')
      .lean();

    const result = drivers.map(d => {
      const statusDate = d.lastStatusChange?.changedAt || d.updatedAt || d.createdAt;
      const daysInStatus = statusDate ? Math.floor((now - new Date(statusDate)) / (1000 * 60 * 60 * 24)) : null;

      return {
        driverId: d._id,
        fullName: d.fullName,
        employeeCode: d.employeeCode,
        status: d.status,
        contactsVerified: d.contactsVerified || false,
        personalVerificationDone: d.personalVerificationDone || false,
        contactsVerifiedBy: d.contactsVerifiedBy?.name || null,
        personalVerificationBy: d.personalVerificationBy?.name || null,
        daysInStatus,
      };
    });

    sendSuccess(res, result);
  } catch (err) {
    sendError(res, err.message, 500);
  }
});

// GET /api/reports/expired-doc-violations — expired documents for active drivers
router.get('/expired-doc-violations', requirePermission('reports.compliance_expired_action'), async (req, res) => {
  try {
    const DriverDocument = getModel(req, 'DriverDocument');
    const now = new Date();

    const docs = await DriverDocument.find({
      expiryDate: { $lt: now },
    })
      .populate({
        path: 'driverId',
        match: { status: 'active' },
        select: 'fullName employeeCode clientId',
        populate: { path: 'clientId', select: 'name' },
      })
      .lean();

    // Filter out docs where driver didn't match (not active)
    const result = docs
      .filter(d => d.driverId)
      .map(d => ({
        driverId: d.driverId._id,
        driverName: d.driverId.fullName,
        employeeCode: d.driverId.employeeCode,
        clientName: d.driverId.clientId?.name || 'Unknown',
        docType: d.docType,
        expiryDate: d.expiryDate,
        daysExpired: Math.floor((now - new Date(d.expiryDate)) / (1000 * 60 * 60 * 24)),
        documentStatus: d.status,
      }))
      .sort((a, b) => b.daysExpired - a.daysExpired);

    sendSuccess(res, result);
  } catch (err) {
    sendError(res, err.message, 500);
  }
});

// GET /api/reports/sim-compliance — placeholder until SIM module is integrated
router.get('/sim-compliance', requirePermission('reports.compliance_sim_compliance'), async (req, res) => {
  try {
    sendSuccess(res, { message: 'SIM Card module not yet integrated. This report will be available once the TelecomSim model is connected.' });
  } catch (err) {
    sendError(res, err.message, 500);
  }
});

// GET /api/reports/attrition-tenure — attrition rates and tenure analysis
router.get('/attrition-tenure', requirePermission('reports.compliance_attrition'), async (req, res) => {
  try {
    const Driver = getModel(req, 'Driver');
    const { year, month } = req.query;

    // Default to last 12 months
    let startDate, endDate;
    if (year && month) {
      startDate = new Date(parseInt(year), parseInt(month) - 1, 1);
      endDate = new Date(parseInt(year), parseInt(month), 1);
    } else if (year) {
      startDate = new Date(parseInt(year), 0, 1);
      endDate = new Date(parseInt(year) + 1, 0, 1);
    } else {
      endDate = new Date();
      startDate = new Date();
      startDate.setMonth(startDate.getMonth() - 12);
    }

    const matchFilter = {
      status: { $in: ['resigned', 'offboarded'] },
    };
    if (startDate) {
      matchFilter['lastStatusChange.changedAt'] = { $gte: startDate, $lt: endDate };
    }

    const departed = await Driver.find(matchFilter)
      .populate('clientId', 'name')
      .populate('projectId', 'name')
      .lean();

    // Calculate total active for attrition rate
    const totalActive = await Driver.countDocuments({ status: 'active' });

    let totalTenureDays = 0;
    const byClient = {};
    const byReason = {};
    const recentDepartures = [];

    for (const d of departed) {
      const start = d.joinDate || d.createdAt;
      const end = d.lastStatusChange?.changedAt || d.updatedAt;
      const tenureDays = start && end ? Math.floor((new Date(end) - new Date(start)) / (1000 * 60 * 60 * 24)) : 0;
      totalTenureDays += tenureDays;

      // By client
      const clientKey = d.clientId?._id?.toString() || 'unassigned';
      if (!byClient[clientKey]) {
        byClient[clientKey] = { clientId: d.clientId?._id || null, clientName: d.clientId?.name || 'Unassigned', departed: 0, totalTenure: 0 };
      }
      byClient[clientKey].departed++;
      byClient[clientKey].totalTenure += tenureDays;

      // By reason
      const reason = d.lastStatusChange?.reason || d.status;
      byReason[reason] = (byReason[reason] || 0) + 1;

      recentDepartures.push({
        driverId: d._id,
        fullName: d.fullName,
        employeeCode: d.employeeCode,
        clientName: d.clientId?.name || 'Unassigned',
        projectName: d.projectId?.name || 'Unassigned',
        status: d.status,
        reason: d.lastStatusChange?.reason || null,
        tenureDays,
        departureDate: d.lastStatusChange?.changedAt || d.updatedAt,
      });
    }

    const clientStats = Object.values(byClient).map(c => ({
      clientId: c.clientId,
      clientName: c.clientName,
      departed: c.departed,
      avgTenure: c.departed > 0 ? Math.round(c.totalTenure / c.departed) : 0,
    }));

    const reasonStats = Object.entries(byReason).map(([reason, count]) => ({ reason, count }));

    sendSuccess(res, {
      attritionRate: totalActive + departed.length > 0
        ? Math.round((departed.length / (totalActive + departed.length)) * 10000) / 100
        : 0,
      averageTenureDays: departed.length > 0 ? Math.round(totalTenureDays / departed.length) : 0,
      totalDeparted: departed.length,
      byClient: clientStats,
      byReason: reasonStats,
      recentDepartures: recentDepartures.sort((a, b) => new Date(b.departureDate) - new Date(a.departureDate)),
    });
  } catch (err) {
    sendError(res, err.message, 500);
  }
});

// =============================================
// ACCOUNTS TEAM REPORTS
// =============================================

// GET /api/reports/deduction-breakdown
router.get('/deduction-breakdown', requirePermission('reports.accounts_deduction_breakdown'), async (req, res) => {
  try {
    const SalaryRun = getModel(req, 'SalaryRun');
    const { year, month } = req.query;
    if (!year || !month) return sendError(res, 'year and month are required', 400);

    const match = {
      'period.year': parseInt(year),
      'period.month': parseInt(month),
      isDeleted: { $ne: true },
    };

    // Group by deduction type
    const byType = await SalaryRun.aggregate([
      { $match: match },
      { $unwind: '$deductions' },
      {
        $group: {
          _id: '$deductions.type',
          count: { $sum: 1 },
          totalAmount: { $sum: '$deductions.amount' },
        },
      },
      { $project: { _id: 0, type: '$_id', count: 1, totalAmount: 1 } },
      { $sort: { totalAmount: -1 } },
    ]);

    // Group by driver
    const byDriver = await SalaryRun.aggregate([
      { $match: match },
      { $unwind: '$deductions' },
      {
        $group: {
          _id: '$driverId',
          deductions: { $push: { type: '$deductions.type', amount: '$deductions.amount' } },
          totalDeductions: { $sum: '$deductions.amount' },
        },
      },
      {
        $lookup: {
          from: 'drivers',
          localField: '_id',
          foreignField: '_id',
          as: 'driver',
        },
      },
      { $unwind: { path: '$driver', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          driverId: '$_id',
          driverName: { $ifNull: ['$driver.fullName', 'Unknown'] },
          employeeCode: { $ifNull: ['$driver.employeeCode', ''] },
          deductions: 1,
          totalDeductions: 1,
        },
      },
      { $sort: { totalDeductions: -1 } },
    ]);

    sendSuccess(res, { byType, byDriver });
  } catch (err) {
    sendError(res, err.message, 500);
  }
});

// GET /api/reports/advance-schedule
router.get('/advance-schedule', requirePermission('reports.accounts_advance_schedule'), async (req, res) => {
  try {
    const DriverAdvance = getModel(req, 'DriverAdvance');
    const { year, month } = req.query;
    if (!year || !month) return sendError(res, 'year and month are required', 400);

    const y = parseInt(year);
    const m = parseInt(month);

    const advances = await DriverAdvance.aggregate([
      { $match: { status: 'approved' } },
      { $unwind: '$recoverySchedule' },
      {
        $match: {
          'recoverySchedule.period.year': y,
          'recoverySchedule.period.month': m,
        },
      },
      {
        $group: {
          _id: { advanceId: '$_id', driverId: '$driverId' },
          amount: { $first: '$amount' },
          totalRecovered: { $first: '$totalRecovered' },
          installments: {
            $push: {
              installmentNo: '$recoverySchedule.installmentNo',
              period: '$recoverySchedule.period',
              amountToRecover: '$recoverySchedule.amountToRecover',
              recovered: '$recoverySchedule.recovered',
              recoveredAt: '$recoverySchedule.recoveredAt',
            },
          },
        },
      },
      {
        $lookup: {
          from: 'drivers',
          localField: '_id.driverId',
          foreignField: '_id',
          as: 'driver',
        },
      },
      { $unwind: { path: '$driver', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          advanceId: '$_id.advanceId',
          driverId: '$_id.driverId',
          driverName: { $ifNull: ['$driver.fullName', 'Unknown'] },
          employeeCode: { $ifNull: ['$driver.employeeCode', ''] },
          totalAmount: '$amount',
          amountRemaining: { $subtract: ['$amount', '$totalRecovered'] },
          installments: 1,
        },
      },
      { $sort: { driverName: 1 } },
    ]);

    sendSuccess(res, advances);
  } catch (err) {
    sendError(res, err.message, 500);
  }
});

// GET /api/reports/receivables-aging
router.get('/receivables-aging', requirePermission('reports.accounts_receivables_aging'), async (req, res) => {
  try {
    const DriverReceivable = getModel(req, 'DriverReceivable');
    const now = new Date();

    const receivables = await DriverReceivable.find({
      status: { $in: ['outstanding', 'partially_recovered'] },
    })
      .populate('driverId', 'fullName employeeCode')
      .populate('clientId', 'clientName')
      .lean();

    const buckets = { current: [], overdue_31_60: [], overdue_61_90: [], overdue_90_plus: [] };
    let totalOutstanding = 0;
    let totalRecovered = 0;
    let totalWrittenOff = 0;

    for (const r of receivables) {
      const ageDays = Math.floor((now - new Date(r.createdAt)) / (1000 * 60 * 60 * 24));
      const remaining = r.amount - (r.amountRecovered || 0) - (r.writeOffAmount || 0);
      const entry = {
        receivableNo: r.receivableNo,
        driverId: r.driverId?._id || r.driverId,
        driverName: r.driverId?.fullName || r.driverName || 'Unknown',
        employeeCode: r.driverId?.employeeCode || r.employeeCode || '',
        clientName: r.clientId?.clientName || '',
        creditNoteNo: r.creditNoteNo,
        amount: r.amount,
        amountRecovered: r.amountRecovered || 0,
        amountRemaining: remaining,
        ageDays,
        status: r.status,
      };

      totalOutstanding += remaining;
      totalRecovered += r.amountRecovered || 0;
      totalWrittenOff += r.writeOffAmount || 0;

      if (ageDays <= 30) buckets.current.push(entry);
      else if (ageDays <= 60) buckets.overdue_31_60.push(entry);
      else if (ageDays <= 90) buckets.overdue_61_90.push(entry);
      else buckets.overdue_90_plus.push(entry);
    }

    sendSuccess(res, {
      buckets,
      summary: {
        totalOutstanding: Math.round(totalOutstanding * 100) / 100,
        totalRecovered: Math.round(totalRecovered * 100) / 100,
        totalWrittenOff: Math.round(totalWrittenOff * 100) / 100,
      },
    });
  } catch (err) {
    sendError(res, err.message, 500);
  }
});

// GET /api/reports/cn-reconciliation
router.get('/cn-reconciliation', requirePermission('reports.accounts_cn_reconciliation'), async (req, res) => {
  try {
    const CreditNote = getModel(req, 'CreditNote');
    const { year, month } = req.query;

    const match = { isDeleted: { $ne: true } };
    if (year) match['period.year'] = parseInt(year);
    if (month) match['period.month'] = parseInt(month);

    const creditNotes = await CreditNote.find(match)
      .populate('clientId', 'clientName')
      .populate('linkedInvoiceId', 'invoiceNo')
      .populate('lineItems.driverId', 'fullName employeeCode')
      .lean();

    const result = creditNotes.map((cn) => {
      const clientSettled = !!cn.linkedInvoiceId;
      const lineItems = (cn.lineItems || []).map((li) => {
        let driverSideStatus = 'unresolved';
        if (li.salaryDeducted) driverSideStatus = 'deducted';
        else if (li.receivableCreated) driverSideStatus = 'receivable';
        else if (li.manuallyResolved) driverSideStatus = 'manual';
        else if (li.pendingNextSalary) driverSideStatus = 'pending';

        return {
          driverId: li.driverId?._id || li.driverId,
          driverName: li.driverId?.fullName || li.driverName || 'Unknown',
          employeeCode: li.driverId?.employeeCode || li.employeeCode || '',
          noteType: li.noteType,
          amount: li.amount,
          driverSideStatus,
        };
      });

      return {
        creditNoteNo: cn.creditNoteNo,
        clientName: cn.clientId?.clientName || '',
        period: cn.period,
        totalAmount: cn.totalAmount,
        status: cn.status,
        clientSettled,
        lineItems,
      };
    });

    sendSuccess(res, result);
  } catch (err) {
    sendError(res, err.message, 500);
  }
});

// GET /api/reports/invoice-reconciliation
router.get('/invoice-reconciliation', requirePermission('reports.accounts_invoice_reconciliation'), async (req, res) => {
  try {
    const Invoice = getModel(req, 'Invoice');
    const { year } = req.query;

    const match = { isDeleted: { $ne: true } };
    if (year) match['period.year'] = parseInt(year);

    const invoices = await Invoice.find(match)
      .populate('clientId', 'clientName')
      .lean();

    const result = invoices.map((inv) => {
      const creditNotesTotal = (inv.linkedCreditNotes || []).reduce((sum, cn) => sum + (cn.amount || 0), 0);
      const adjustedTotal = inv.adjustedTotal != null ? inv.adjustedTotal : inv.total - creditNotesTotal;
      const paymentVariance = (inv.amountReceived || 0) - adjustedTotal;

      return {
        invoiceNo: inv.invoiceNo,
        clientName: inv.clientId?.clientName || '',
        period: inv.period,
        total: inv.total,
        creditNotesLinked: (inv.linkedCreditNotes || []).length,
        adjustedTotal: Math.round(adjustedTotal * 100) / 100,
        amountReceived: inv.amountReceived || 0,
        paymentVariance: Math.round(paymentVariance * 100) / 100,
        paymentReference: inv.paymentReference || '',
        status: inv.status,
      };
    });

    sendSuccess(res, result);
  } catch (err) {
    sendError(res, err.message, 500);
  }
});

// GET /api/reports/fine-deductions
router.get('/fine-deductions', requirePermission('reports.accounts_fine_deductions'), async (req, res) => {
  try {
    const VehicleFine = getModel(req, 'VehicleFine');
    const { year, month } = req.query;

    const match = {};
    if (year && month) {
      const start = new Date(parseInt(year), parseInt(month) - 1, 1);
      const end = new Date(parseInt(year), parseInt(month), 1);
      match.fineDate = { $gte: start, $lt: end };
    } else if (year) {
      const start = new Date(parseInt(year), 0, 1);
      const end = new Date(parseInt(year) + 1, 0, 1);
      match.fineDate = { $gte: start, $lt: end };
    }

    const fines = await VehicleFine.find(match)
      .populate('driverId', 'fullName employeeCode')
      .lean();

    let totalFines = 0;
    let totalPending = 0;
    let totalDeducted = 0;
    let totalWaived = 0;
    let totalDisputed = 0;

    const records = fines.map((f) => {
      totalFines += f.amount || 0;
      if (f.status === 'pending' || f.status === 'unassigned') totalPending += f.amount || 0;
      else if (f.status === 'deducted') totalDeducted += f.amount || 0;
      else if (f.status === 'waived') totalWaived += f.amount || 0;
      else if (f.status === 'disputed') totalDisputed += f.amount || 0;

      return {
        vehiclePlate: f.vehiclePlate || '',
        driverName: f.driverId?.fullName || f.driverName || 'Unknown',
        employeeCode: f.driverId?.employeeCode || f.driverEmployeeCode || '',
        fineType: f.fineType,
        amount: f.amount,
        fineDate: f.fineDate,
        status: f.status,
        referenceNumber: f.referenceNumber || '',
        salaryRunId: f.salaryRunId || null,
        deductionPeriod: f.deductionPeriod || null,
      };
    });

    sendSuccess(res, {
      records,
      summary: {
        totalFines: Math.round(totalFines * 100) / 100,
        totalPending: Math.round(totalPending * 100) / 100,
        totalDeducted: Math.round(totalDeducted * 100) / 100,
        totalWaived: Math.round(totalWaived * 100) / 100,
        totalDisputed: Math.round(totalDisputed * 100) / 100,
      },
    });
  } catch (err) {
    sendError(res, err.message, 500);
  }
});

// GET /api/reports/wps-reconciliation
router.get('/wps-reconciliation', requirePermission('reports.accounts_wps_reconciliation'), async (req, res) => {
  try {
    const SalaryRun = getModel(req, 'SalaryRun');
    const { year, month } = req.query;
    if (!year || !month) return sendError(res, 'year and month are required', 400);

    const runs = await SalaryRun.find({
      'period.year': parseInt(year),
      'period.month': parseInt(month),
      status: 'paid',
      isDeleted: { $ne: true },
    })
      .populate('driverId', 'fullName employeeCode bankName iban')
      .lean();

    let totalPaid = 0;
    let driversWithMissingIban = 0;

    const records = runs.map((r) => {
      totalPaid += r.netSalary || 0;
      const missingBankDetails = !r.driverId?.iban;
      if (missingBankDetails) driversWithMissingIban++;

      return {
        runId: r.runId,
        driverName: r.driverId?.fullName || 'Unknown',
        employeeCode: r.driverId?.employeeCode || '',
        bankName: r.driverId?.bankName || '',
        iban: r.driverId?.iban || '',
        netSalary: r.netSalary,
        paidAt: r.paidAt,
        missingBankDetails,
      };
    });

    sendSuccess(res, {
      records,
      summary: {
        totalPaid: Math.round(totalPaid * 100) / 100,
        driversWithMissingIban,
      },
    });
  } catch (err) {
    sendError(res, err.message, 500);
  }
});

// GET /api/reports/ledger-summary
router.get('/ledger-summary', requirePermission('reports.accounts_ledger_summary'), async (req, res) => {
  try {
    const DriverLedger = getModel(req, 'DriverLedger');
    const { year, month, driverId } = req.query;
    if (!year || !month) return sendError(res, 'year and month are required', 400);

    const mongoose = require('mongoose');
    const match = {
      'period.year': parseInt(year),
      'period.month': parseInt(month),
      isDeleted: { $ne: true },
    };
    if (driverId) match.driverId = new mongoose.Types.ObjectId(driverId);

    const ledgerData = await DriverLedger.aggregate([
      { $match: match },
      { $sort: { createdAt: 1 } },
      {
        $group: {
          _id: '$driverId',
          totalCredits: { $sum: '$credit' },
          totalDebits: { $sum: '$debit' },
          entries: {
            $push: {
              entryType: '$entryType',
              debit: '$debit',
              credit: '$credit',
              runningBalance: '$runningBalance',
              description: '$description',
              createdAt: '$createdAt',
            },
          },
        },
      },
      {
        $lookup: {
          from: 'drivers',
          localField: '_id',
          foreignField: '_id',
          as: 'driver',
        },
      },
      { $unwind: { path: '$driver', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          driverId: '$_id',
          driverName: { $ifNull: ['$driver.fullName', 'Unknown'] },
          employeeCode: { $ifNull: ['$driver.employeeCode', ''] },
          totalCredits: 1,
          totalDebits: 1,
          closingBalance: { $subtract: ['$totalCredits', '$totalDebits'] },
          entries: 1,
        },
      },
      { $sort: { driverName: 1 } },
    ]);

    sendSuccess(res, ledgerData);
  } catch (err) {
    sendError(res, err.message, 500);
  }
});

// GET /api/reports/sim-cost
router.get('/sim-cost', requirePermission('reports.accounts_sim_cost'), async (req, res) => {
  try {
    sendSuccess(res, {
      message: 'SIM cost report is a placeholder — SIM module not yet integrated.',
      data: [],
    });
  } catch (err) {
    sendError(res, err.message, 500);
  }
});

module.exports = router;
