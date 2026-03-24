const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { SalaryRun, Invoice, Driver, Advance, DriverDocument, Supplier } = require('../models');
const { sendSuccess, sendError } = require('../utils/responseHelper');

// All routes are protected
router.use(protect);

// GET /api/reports/payroll-summary — total gross/net/deductions for period, grouped by client
router.get('/payroll-summary', async (req, res) => {
  const { year, month } = req.query;
  if (!year || !month) return sendError(res, 'year and month are required', 400);

  const summary = await SalaryRun.aggregate([
    {
      $match: {
        'period.year': parseInt(year),
        'period.month': parseInt(month),
        status: { $in: ['approved', 'paid'] },
      },
    },
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

// GET /api/reports/invoice-aging — outstanding invoices grouped by age
router.get('/invoice-aging', async (req, res) => {
  const now = new Date();

  const invoices = await Invoice.find({
    status: { $in: ['sent', 'overdue'] },
  }).populate('clientId', 'name');

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
router.get('/cost-per-driver', async (req, res) => {
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
router.get('/advance-outstanding', async (req, res) => {
  const advances = await Advance.find({ status: 'active' })
    .populate('driverId', 'fullName employeeCode clientId')
    .populate('approvedBy', 'name');

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
router.get('/document-expiry', async (req, res) => {
  const days = parseInt(req.query.days) || 30;
  const now = new Date();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + days);

  const documents = await DriverDocument.find({
    expiryDate: { $gte: now, $lte: cutoff },
    status: { $ne: 'expired' },
  })
    .populate('driverId', 'fullName employeeCode clientId status')
    .sort({ expiryDate: 1 });

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
router.get('/fleet-utilisation', async (req, res) => {
  try {
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
          ['resigned', 'offboarding'].includes(d.status) && d.vehiclePlate
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

    // By vehicle type
    const allDriversWithVehicle = await Driver.find({
      vehiclePlate: { $ne: null, $exists: true },
    }).lean();
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
router.get('/vehicle-cost-per-driver', async (req, res) => {
  try {
    const { year, month } = req.query;
    if (!year || !month) return sendError(res, 'year and month are required', 400);

    const runs = await SalaryRun.find({
      'period.year': parseInt(year),
      'period.month': parseInt(month),
      status: { $in: ['draft', 'approved', 'paid'] },
      'deductions.type': 'vehicle_rental',
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

module.exports = router;
