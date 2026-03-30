const {
  AttendanceBatch,
  AttendanceRecord,
  SalaryRun,
  Driver,
  DriverAdvance,
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
      const STANDARD_DAYS = 26;

      let grossSalary = 0;
      if (driver.payStructure === 'DAILY_RATE') {
        grossSalary = baseSalary * workingDays;
      } else {
        // MONTHLY_FIXED — prorate by working days
        grossSalary = parseFloat(
          ((baseSalary / STANDARD_DAYS) * workingDays).toFixed(2)
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

      // STEP 5 — Calculate net salary
      const totalDeductions = parseFloat(totalAdvanceDeduction.toFixed(2));
      const netSalary = parseFloat(
        Math.max(0, grossSalary - totalDeductions).toFixed(2)
      );

      // STEP 6 — Create salary run
      const salaryRun = await SalaryRun.create({
        driverId: driver._id,
        projectId: batch.projectId._id,
        clientId: batch.clientId._id,
        attendanceBatchId: batchId,
        period: batch.period,
        workingDays,
        overtimeHours,
        baseSalary,
        grossSalary,
        advanceDeductions,
        totalDeductions,
        netSalary,
        status: 'draft',
        processedBy: processedByUserId,
      });

      // STEP 7 — Mark advance installments as recovered
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
 * Approve a salary run.
 * @deprecated Use stage-specific functions in salary.service.js instead.
 * Kept for backward compatibility — delegates to the main salary service.
 */
async function approveSalaryRun(salaryRunId, approvedByUserId) {
  const salaryService = require('./salary.service');
  return salaryService.approveSalaryRun(salaryRunId, approvedByUserId);
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

module.exports = { runSalaryForBatch, approveSalaryRun, getSalaryRunsByBatch };
