const {
  Driver,
  AttendanceRecord,
  AttendanceBatch,
  SalaryRun,
  Advance,
  Supplier,
  DriverLedger,
} = require('../models');
const { SALARY } = require('../config/constants');

/**
 * Calculate salary for a single driver for a given period.
 */
const calculateDriverSalary = async (driverId, year, month, processedBy) => {
  // 1. Fetch driver
  const driver = await Driver.findById(driverId).populate('supplierId');
  if (!driver) {
    const err = new Error('Driver not found');
    err.statusCode = 404;
    throw err;
  }

  // 2. Fetch approved attendance record for this period
  const attendance = await AttendanceRecord.findOne({
    driverId,
    'period.year': year,
    'period.month': month,
    status: { $in: ['valid', 'warning', 'overridden'] },
  }).populate('batchId');

  if (!attendance) {
    const err = new Error(
      `No approved attendance record found for driver ${driver.employeeCode} in ${year}-${String(month).padStart(2, '0')}`
    );
    err.statusCode = 404;
    throw err;
  }

  // Verify the batch is approved
  if (attendance.batchId && !['approved', 'processed'].includes(attendance.batchId.status)) {
    const err = new Error(
      `Attendance batch is not approved (status: ${attendance.batchId.status})`
    );
    err.statusCode = 400;
    throw err;
  }

  const { baseSalary, payStructure } = driver;
  const { workingDays, overtimeHours = 0 } = attendance;

  // 3. Calculate prorated salary based on pay structure
  let proratedSalary = 0;
  if (payStructure === 'MONTHLY_FIXED') {
    proratedSalary = (baseSalary / SALARY.STANDARD_WORKING_DAYS) * workingDays;
  } else if (payStructure === 'DAILY_RATE') {
    proratedSalary = baseSalary * workingDays;
  } else if (payStructure === 'PER_TRIP') {
    // PER_TRIP is handled separately; prorated salary is 0
    proratedSalary = 0;
  }

  proratedSalary = Math.round(proratedSalary * 100) / 100;

  // 4. Calculate overtime pay
  const otRate =
    (baseSalary / SALARY.STANDARD_WORKING_DAYS / SALARY.STANDARD_HOURS_PER_DAY) *
    SALARY.OT_MULTIPLIER;
  const overtimePay = Math.round(otRate * overtimeHours * 100) / 100;

  // 5. Calculate allowances
  const allowances = [
    { type: 'transport', amount: SALARY.TRANSPORT_ALLOWANCE },
    {
      type: 'food',
      amount: Math.round(baseSalary * SALARY.FOOD_ALLOWANCE_RATE * 100) / 100,
    },
  ];
  const totalAllowances = allowances.reduce((sum, a) => sum + a.amount, 0);

  // 6. Gross salary
  const grossSalary =
    Math.round((proratedSalary + overtimePay + totalAllowances) * 100) / 100;

  // 7. Calculate deductions
  const deductions = await calculateDeductions(driverId, year, month, grossSalary);
  const totalDeductions = Math.round(
    deductions.reduce((sum, d) => sum + d.amount, 0) * 100
  ) / 100;

  // 8. Net salary (cap at 0, carry over excess)
  let netSalary = Math.round((grossSalary - totalDeductions) * 100) / 100;
  let deductionCarryover = 0;

  if (netSalary < 0) {
    deductionCarryover = Math.abs(netSalary);
    netSalary = 0;

    // Add carryover as a note; store for next month
    deductions.push({
      type: 'deduction_carryover',
      referenceId: null,
      amount: -deductionCarryover, // negative to indicate it's deferred
      description: `Excess deductions of ${deductionCarryover} AED carried to next month`,
      status: 'pending',
    });
  }

  // 9. Create SalaryRun document
  const salaryRun = await SalaryRun.create({
    driverId,
    clientId: driver.clientId,
    period: { year, month },
    attendanceRecordId: attendance._id,
    workingDays,
    overtimeHours,
    baseSalary,
    proratedSalary,
    overtimePay,
    allowances,
    grossSalary,
    deductions: deductions.filter((d) => d.amount > 0),
    totalDeductions,
    netSalary,
    status: 'draft',
    processedBy,
    notes: deductionCarryover > 0
      ? `Deduction carryover of ${deductionCarryover} AED to next month`
      : undefined,
  });

  // Store carryover for next month if needed
  if (deductionCarryover > 0) {
    await storeDeductionCarryover(driverId, year, month, deductionCarryover);
  }

  return salaryRun;
};

/**
 * Calculate all deductions for a driver in a given period.
 */
const calculateDeductions = async (driverId, year, month, grossSalary) => {
  const deductions = [];

  // a) TelecomSim charge
  const driver = await Driver.findById(driverId);
  if (driver.telecomSimId) {
    deductions.push({
      type: 'telecom_sim',
      referenceId: String(driver.telecomSimId),
      amount: SALARY.TELECOM_SIM_MONTHLY_CHARGE,
      description: 'Monthly telecom SIM charge',
      status: 'applied',
    });
  }

  // b) Vehicle rental (supplier monthly rate)
  if (driver.supplierId) {
    const supplier = await Supplier.findById(driver.supplierId);
    if (supplier && supplier.monthlyRate && supplier.type === 'vehicle_leasing') {
      // Prorate if driver joined mid-month
      let vehicleRate = supplier.monthlyRate;
      if (driver.joinDate) {
        const joinDate = new Date(driver.joinDate);
        const periodStart = new Date(year, month - 1, 1);
        const periodEnd = new Date(year, month, 0);
        const totalDaysInMonth = periodEnd.getDate();

        if (
          joinDate.getFullYear() === year &&
          joinDate.getMonth() + 1 === month &&
          joinDate.getDate() > 1
        ) {
          const activeDays = totalDaysInMonth - joinDate.getDate() + 1;
          vehicleRate = Math.round(
            (supplier.monthlyRate / totalDaysInMonth) * activeDays * 100
          ) / 100;
        }
      }

      deductions.push({
        type: 'vehicle_rental',
        referenceId: String(driver.supplierId),
        amount: vehicleRate,
        description: `Vehicle rental - ${supplier.name}`,
        status: 'applied',
      });
    }
  }

  // c) Salik tolls — query DriverLedger for any salik/toll debit entries
  const salikEntries = await DriverLedger.find({
    driverId,
    entryType: 'deduction_debit',
    description: /salik|toll/i,
    'period.year': year,
    'period.month': month,
  });

  for (const entry of salikEntries) {
    deductions.push({
      type: 'salik',
      referenceId: entry.referenceId || String(entry._id),
      amount: entry.debit,
      description: entry.description || 'Salik toll charge',
      status: 'applied',
    });
  }

  // d) Advance recovery
  const activeAdvances = await Advance.find({
    driverId,
    status: 'active',
  });

  for (const advance of activeAdvances) {
    const outstanding = advance.amountIssued - advance.amountRecovered;
    if (outstanding <= 0) continue;

    // Cap recovery at 50% of gross salary
    const maxRecovery = grossSalary * SALARY.MAX_ADVANCE_RECOVERY_RATE;
    const recoveryAmount = Math.min(outstanding, maxRecovery);

    if (recoveryAmount > 0) {
      deductions.push({
        type: 'advance_recovery',
        referenceId: String(advance._id),
        amount: Math.round(recoveryAmount * 100) / 100,
        description: `Advance recovery (outstanding: ${outstanding} AED)`,
        status: 'applied',
      });
    }
  }

  // e) Penalties — check DriverLedger for penalty entries in this period
  const penaltyEntries = await DriverLedger.find({
    driverId,
    entryType: 'penalty',
    'period.year': year,
    'period.month': month,
  });

  for (const penalty of penaltyEntries) {
    deductions.push({
      type: 'penalty',
      referenceId: penalty.referenceId || String(penalty._id),
      amount: penalty.debit,
      description: penalty.description || 'Penalty deduction',
      status: 'applied',
    });
  }

  // f) Deduction carryover from previous month
  const carryover = await getDeductionCarryover(driverId, year, month);
  if (carryover > 0) {
    deductions.push({
      type: 'deduction_carryover',
      referenceId: null,
      amount: carryover,
      description: `Deduction carryover from previous month`,
      status: 'applied',
    });
  }

  return deductions;
};

/**
 * Store deduction carryover for the next month.
 * Uses a SalaryRun note convention; stored as a ledger entry.
 */
const storeDeductionCarryover = async (driverId, year, month, amount) => {
  // Calculate next month
  let nextMonth = month + 1;
  let nextYear = year;
  if (nextMonth > 12) {
    nextMonth = 1;
    nextYear = year + 1;
  }

  await DriverLedger.create({
    driverId,
    entryType: 'manual_debit',
    debit: amount,
    credit: 0,
    description: `Deduction carryover from ${year}-${String(month).padStart(2, '0')}`,
    referenceId: `carryover_${year}_${month}`,
    period: { year: nextYear, month: nextMonth },
  });
};

/**
 * Get deduction carryover from the previous month.
 */
const getDeductionCarryover = async (driverId, year, month) => {
  const carryoverEntry = await DriverLedger.findOne({
    driverId,
    referenceId: new RegExp(`^carryover_`),
    'period.year': year,
    'period.month': month,
    entryType: 'manual_debit',
  });

  return carryoverEntry ? carryoverEntry.debit : 0;
};

/**
 * Run payroll for all active drivers of a client for a given period.
 */
const runPayroll = async (clientId, year, month, processedBy) => {
  // 1. Find all active drivers for this client with approved attendance
  const attendanceRecords = await AttendanceRecord.find({
    clientId,
    'period.year': year,
    'period.month': month,
    status: { $in: ['valid', 'warning', 'overridden'] },
  }).populate('batchId');

  // Filter to only those with approved batches
  const approvedRecords = attendanceRecords.filter(
    (r) => r.batchId && ['approved', 'processed'].includes(r.batchId.status)
  );

  if (approvedRecords.length === 0) {
    const err = new Error(
      'No approved attendance records found for this client/period'
    );
    err.statusCode = 404;
    throw err;
  }

  // 2. Calculate salary for each driver
  const runs = [];
  const errors = [];
  let totalGross = 0;
  let totalDeductions = 0;
  let totalNet = 0;

  for (const record of approvedRecords) {
    try {
      const salaryRun = await calculateDriverSalary(
        record.driverId,
        year,
        month,
        processedBy
      );
      runs.push(salaryRun);
      totalGross += salaryRun.grossSalary;
      totalDeductions += salaryRun.totalDeductions;
      totalNet += salaryRun.netSalary;
    } catch (err) {
      errors.push({
        driverId: record.driverId,
        error: err.message,
      });
    }
  }

  // 3. Post ledger entries for each run
  for (const run of runs) {
    await postLedgerEntries(run, processedBy);
  }

  // 4. Update advance records
  for (const run of runs) {
    await updateAdvanceRecoveries(run);
  }

  // 5. Mark attendance batch as processed
  const batchIds = [...new Set(approvedRecords.map((r) => String(r.batchId._id)))];
  await AttendanceBatch.updateMany(
    { _id: { $in: batchIds } },
    { $set: { status: 'processed' } }
  );

  return {
    totalDrivers: runs.length,
    totalGross: Math.round(totalGross * 100) / 100,
    totalDeductions: Math.round(totalDeductions * 100) / 100,
    totalNet: Math.round(totalNet * 100) / 100,
    runs,
    errors: errors.length > 0 ? errors : undefined,
  };
};

/**
 * Post immutable ledger entries after a salary run is created.
 */
const postLedgerEntries = async (salaryRun, createdBy) => {
  const { driverId, period } = salaryRun;

  // Get the last running balance for this driver
  const lastEntry = await DriverLedger.findOne({ driverId })
    .sort({ createdAt: -1 })
    .limit(1);
  let runningBalance = lastEntry ? lastEntry.runningBalance : 0;

  // 1. Post salary credit entry
  runningBalance += salaryRun.netSalary;
  await DriverLedger.create({
    driverId,
    salaryRunId: salaryRun._id,
    entryType: 'salary_credit',
    debit: 0,
    credit: salaryRun.netSalary,
    runningBalance,
    description: `Salary credit for ${period.year}-${String(period.month).padStart(2, '0')}`,
    referenceId: salaryRun.runId,
    period,
    createdBy,
  });

  // 2. Post deduction entries
  for (const deduction of salaryRun.deductions) {
    if (deduction.amount <= 0) continue;

    runningBalance -= deduction.amount;
    await DriverLedger.create({
      driverId,
      salaryRunId: salaryRun._id,
      entryType: deduction.type === 'advance_recovery' ? 'advance_recovery' : 'deduction_debit',
      debit: deduction.amount,
      credit: 0,
      runningBalance,
      description: deduction.description,
      referenceId: deduction.referenceId || salaryRun.runId,
      period,
      createdBy,
    });
  }
};

/**
 * Update advance recovery amounts after salary run.
 */
const updateAdvanceRecoveries = async (salaryRun) => {
  const advanceDeductions = salaryRun.deductions.filter(
    (d) => d.type === 'advance_recovery'
  );

  for (const deduction of advanceDeductions) {
    if (!deduction.referenceId) continue;

    const advance = await Advance.findById(deduction.referenceId);
    if (!advance) continue;

    advance.amountRecovered += deduction.amount;
    advance.recoverySchedule.push({
      salaryRunId: salaryRun._id,
      amount: deduction.amount,
      date: new Date(),
    });

    if (advance.amountRecovered >= advance.amountIssued) {
      advance.status = 'fully_recovered';
    }

    await advance.save();
  }
};

/**
 * Approve a salary run.
 */
const approveSalaryRun = async (runId, approvedBy) => {
  const salaryRun = await SalaryRun.findById(runId);
  if (!salaryRun) {
    const err = new Error('Salary run not found');
    err.statusCode = 404;
    throw err;
  }

  if (salaryRun.status !== 'draft' && salaryRun.status !== 'pending_approval') {
    const err = new Error(`Cannot approve salary run in ${salaryRun.status} status`);
    err.statusCode = 400;
    throw err;
  }

  salaryRun.status = 'approved';
  salaryRun.approvedBy = approvedBy;
  salaryRun.approvedAt = new Date();
  await salaryRun.save();

  return salaryRun;
};

/**
 * Generate WPS (Wages Protection System) SIF file content for a period.
 */
const generateWpsFile = async (clientId, year, month) => {
  const query = {
    'period.year': year,
    'period.month': month,
    status: { $in: ['approved', 'paid'] },
  };
  if (clientId) query.clientId = clientId;

  const runs = await SalaryRun.find(query).populate({
    path: 'driverId',
    select: 'employeeCode fullName bankName iban',
  });

  if (runs.length === 0) {
    const err = new Error('No approved salary runs found for this period');
    err.statusCode = 404;
    throw err;
  }

  const { WPS } = require('../config/constants');
  const salaryMonth = `${year}${String(month).padStart(2, '0')}`;

  // SIF header
  const header = [
    'EmployerID',
    'RoutingCode',
    'EmployeeID',
    'SalaryMonth',
    'BasicSalary',
    'Allowances',
    'TotalSalary',
    'IBAN',
    'BankCode',
  ].join(',');

  const rows = runs.map((run) => {
    const driver = run.driverId;
    const totalAllowances = run.allowances.reduce((sum, a) => sum + a.amount, 0);
    const bankCode = extractBankCode(driver.iban);

    return [
      WPS.EMPLOYER_ID,
      bankCode,
      driver.employeeCode,
      salaryMonth,
      run.proratedSalary + run.overtimePay,
      totalAllowances,
      run.netSalary,
      driver.iban || '',
      bankCode,
    ].join(',');
  });

  return [header, ...rows].join('\n');
};

/**
 * Extract bank code from IBAN (UAE IBAN format: AE + 2 check digits + 3 bank code + 16 account)
 */
const extractBankCode = (iban) => {
  if (!iban || iban.length < 7) return '';
  return iban.substring(4, 7);
};

module.exports = {
  calculateDriverSalary,
  calculateDeductions,
  runPayroll,
  postLedgerEntries,
  approveSalaryRun,
  generateWpsFile,
};
