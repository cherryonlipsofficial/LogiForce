const {
  AttendanceBatch,
  AttendanceRecord,
  SalaryRun,
  Driver,
  DriverAdvance,
  DriverLedger,
  Project,
  User,
} = require('../models');
const { notifyUsers } = require('./notification.service');

/**
 * Generate salary runs for all drivers in an approved attendance batch.
 */
async function runSalaryForBatch(batchId, processedByUserId) {
  // STEP 1 — Validate batch
  const batch = await AttendanceBatch.findById(batchId)
    .populate('projectId', 'name projectCode')
    .populate('clientId', 'name');

  if (!batch) throw Object.assign(new Error('Batch not found'), { statusCode: 404 });

  if (batch.status !== 'fully_approved' && batch.status !== 'invoiced') {
    throw Object.assign(
      new Error(
        `Salary run requires fully approved attendance. Current status: "${batch.status}".`
      ),
      { statusCode: 400 }
    );
  }

  // STEP 2 — Fetch attendance records
  const records = await AttendanceRecord.find({
    batchId,
    status: { $ne: 'error' },
  })
    .populate('driverId', 'fullName employeeCode baseSalary payStructure')
    .lean();

  if (!records.length) {
    throw Object.assign(
      new Error('No attendance records found for this batch.'),
      { statusCode: 400 }
    );
  }

  const results = { created: [], skipped: [], errors: [] };

  for (const record of records) {
    const driver = record.driverId;
    if (!driver) {
      results.skipped.push({ reason: 'Driver not found' });
      continue;
    }

    try {
      // Check for duplicate salary run
      const existing = await SalaryRun.findOne({
        driverId: driver._id,
        projectId: batch.projectId._id,
        'period.year': batch.period.year,
        'period.month': batch.period.month,
        isDeleted: { $ne: true },
      });
      if (existing) {
        results.skipped.push({
          driverId: driver._id,
          reason: 'Salary run already exists for this driver/project/period',
        });
        continue;
      }

      // STEP 3 — Calculate gross salary (no auto OT/Transport/Food)
      const workingDays = record.workingDays || 0;
      const overtimeHours = record.overtimeHours || 0;
      const baseSalary = driver.baseSalary || 0;
      const daysInMonth = new Date(parseInt(batch.period.year), parseInt(batch.period.month), 0).getDate();

      const totalOrders = record.totalOrders || 0;

      let grossSalary = 0;
      if (driver.payStructure === 'DAILY_RATE') {
        grossSalary = baseSalary * workingDays;
      } else if (driver.payStructure === 'PER_ORDER') {
        grossSalary = parseFloat((totalOrders * baseSalary).toFixed(2));
      } else {
        // MONTHLY_FIXED — prorate by actual days in month, capped at base salary
        grossSalary = parseFloat(
          Math.min((baseSalary / daysInMonth) * workingDays, baseSalary).toFixed(2)
        );
      }

      // STEP 4 — Get pending advance installments for this driver/period
      const batchYear = parseInt(batch.period.year);
      const batchMonth = parseInt(batch.period.month);

      const advances = await DriverAdvance.find({
        driverId: driver._id,
        status: 'approved',
        recoverySchedule: {
          $elemMatch: {
            'period.year': batchYear,
            'period.month': batchMonth,
            recovered: false,
          },
        },
      });

      const advanceDeductions = [];
      let totalAdvanceDeduction = 0;

      for (const advance of advances) {
        const installment = advance.recoverySchedule.find(
          (s) =>
            parseInt(s.period.year) === batchYear &&
            parseInt(s.period.month) === batchMonth &&
            !s.recovered
        );
        if (!installment) continue;

        advanceDeductions.push({
          advanceId: advance._id,
          scheduleId: installment._id,
          amount: installment.amountToRecover,
          description: `Advance recovery — installment ${installment.installmentNo}`,
        });
        totalAdvanceDeduction += installment.amountToRecover;
      }

      // STEP 5 — Retrieve previous month's deduction carryover
      const deductions = [];
      const carryover = await getDeductionCarryover(driver._id, batchYear, batchMonth);
      if (carryover > 0) {
        deductions.push({
          type: 'deduction_carryover',
          referenceId: null,
          amount: carryover,
          description: 'Deduction carryover from previous month',
          status: 'applied',
        });
      }

      // STEP 6 — Calculate net salary (cap at 0, carry over excess)
      const totalDeductions = parseFloat(
        (totalAdvanceDeduction + carryover).toFixed(2)
      );
      let netSalary = parseFloat((grossSalary - totalDeductions).toFixed(2));
      let deductionCarryover = 0;

      if (netSalary < 0) {
        deductionCarryover = Math.abs(netSalary);
        netSalary = 0;

        deductions.push({
          type: 'deduction_carryover',
          referenceId: null,
          amount: -deductionCarryover,
          description: `Excess deductions of ${deductionCarryover} AED carried to next month`,
          status: 'pending',
        });
      }

      // STEP 7 — Create salary run
      const salaryRun = await SalaryRun.create({
        driverId: driver._id,
        projectId: batch.projectId._id,
        clientId: batch.clientId._id,
        attendanceBatchId: batchId,
        period: batch.period,
        workingDays,
        overtimeHours,
        totalOrders,
        baseSalary,
        grossSalary,
        deductions: deductions.filter((d) => d.amount > 0),
        advanceDeductions,
        totalDeductions,
        netSalary,
        deductionCarryover,
        status: 'draft',
        processedBy: processedByUserId,
        notes: deductionCarryover > 0
          ? `Deduction carryover of ${deductionCarryover} AED to next month`
          : undefined,
      });

      // STEP 8 — Store carryover for next month if needed
      if (deductionCarryover > 0) {
        await storeDeductionCarryover(driver._id, batchYear, batchMonth, deductionCarryover);
      }

      // STEP 9 — Mark advance installments as recovered
      for (const deduction of advanceDeductions) {
        await DriverAdvance.findOneAndUpdate(
          {
            _id: deduction.advanceId,
            'recoverySchedule._id': deduction.scheduleId,
          },
          {
            $set: {
              'recoverySchedule.$.recovered': true,
              'recoverySchedule.$.recoveredAt': new Date(),
              'recoverySchedule.$.salaryRunId': salaryRun._id,
            },
            $inc: { totalRecovered: deduction.amount },
          }
        );

        // Check if fully recovered
        const updatedAdvance = await DriverAdvance.findById(deduction.advanceId);
        const allRecovered = updatedAdvance.recoverySchedule.every(
          (s) => s.recovered
        );
        if (allRecovered) {
          updatedAdvance.status = 'fully_recovered';
          await updatedAdvance.save();
        }
      }

      results.created.push({
        driverId: driver._id,
        driverName: driver.fullName,
        employeeCode: driver.employeeCode,
        grossSalary,
        totalDeductions,
        netSalary,
        salaryRunId: salaryRun._id,
      });
    } catch (err) {
      results.errors.push({ driverId: driver._id, error: err.message });
    }
  }

  return results;
}

/**
 * Get all salary runs for a given attendance batch.
 */
async function getSalaryRunsByBatch(batchId) {
  return SalaryRun.find({ attendanceBatchId: batchId })
    .populate('driverId', 'fullName employeeCode')
    .populate('advanceDeductions.advanceId', 'amount reason')
    .sort({ createdAt: -1 })
    .lean();
}

/**
 * Store deduction carryover for the next month via DriverLedger.
 * Idempotent: removes any existing carryover for the same source period before creating.
 */
async function storeDeductionCarryover(driverId, year, month, amount) {
  let nextMonth = month + 1;
  let nextYear = year;
  if (nextMonth > 12) {
    nextMonth = 1;
    nextYear = year + 1;
  }

  // Upsert to avoid duplicate carryover entries for the same source period
  await DriverLedger.findOneAndUpdate(
    {
      driverId,
      referenceId: `carryover_${year}_${month}`,
      'period.year': nextYear,
      'period.month': nextMonth,
      entryType: 'manual_debit',
    },
    {
      $set: {
        debit: amount,
        credit: 0,
        description: `Deduction carryover from ${year}-${String(month).padStart(2, '0')}`,
      },
      $setOnInsert: {
        driverId,
        entryType: 'manual_debit',
        referenceId: `carryover_${year}_${month}`,
        period: { year: nextYear, month: nextMonth },
      },
    },
    { upsert: true, new: true }
  );
}

/**
 * Get deduction carryover from a previous month.
 * Sums all matching carryover entries and excludes deleted entries.
 */
async function getDeductionCarryover(driverId, year, month) {
  const carryoverEntries = await DriverLedger.find({
    driverId,
    referenceId: new RegExp(`^carryover_`),
    'period.year': year,
    'period.month': month,
    entryType: 'manual_debit',
    isDeleted: { $ne: true },
  });

  if (!carryoverEntries.length) return 0;

  return Math.round(
    carryoverEntries.reduce((sum, entry) => sum + (entry.debit || 0), 0) * 100
  ) / 100;
}

module.exports = { runSalaryForBatch, getSalaryRunsByBatch };
