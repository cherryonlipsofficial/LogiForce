const { getModel } = require('../config/modelRegistry');
const { SALARY } = require('../config/constants');

/**
 * Calculate salary for a single driver for a given period.
 */
const calculateDriverSalary = async (req, driverId, year, month, processedBy, { clientId: requestClientId, attendanceBatchId } = {}) => {
  const Driver = getModel(req, 'Driver');
  const AttendanceRecord = getModel(req, 'AttendanceRecord');
  const SalaryRun = getModel(req, 'SalaryRun');
  const DriverProjectAssignment = getModel(req, 'DriverProjectAssignment');

  // 1. Fetch driver (with project info)
  const driver = await Driver.findById(driverId)
    .populate('supplierId')
    .populate('projectId', 'name projectCode');
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
  if (attendance.batchId && !['fully_approved', 'invoiced', 'processed'].includes(attendance.batchId.status)) {
    const err = new Error(
      `Attendance batch is not approved (status: ${attendance.batchId.status})`
    );
    err.statusCode = 400;
    throw err;
  }

  const { baseSalary, payStructure } = driver;
  const { workingDays, overtimeHours = 0, totalOrders = 0 } = attendance;

  // 3. Calculate prorated salary based on pay structure
  const daysInMonth = new Date(year, month, 0).getDate();
  let proratedSalary = 0;
  if (payStructure === 'MONTHLY_FIXED') {
    proratedSalary = Math.min((baseSalary / daysInMonth) * workingDays, baseSalary);
  } else if (payStructure === 'DAILY_RATE') {
    proratedSalary = baseSalary * workingDays;
  } else if (payStructure === 'PER_ORDER') {
    proratedSalary = totalOrders * baseSalary;
  }

  proratedSalary = Math.round(proratedSalary * 100) / 100;

  // 4. Gross salary (OT and allowances are not auto-included; configure manually in Draft)
  const overtimePay = 0;
  const allowances = [];

  const grossSalary = Math.round(proratedSalary * 100) / 100;

  // 7. Calculate deductions
  const deductions = await calculateDeductions(req, driverId, year, month, grossSalary);
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

  // 8b. Resolve project billing rate from active assignment snapshot
  let projectId = driver.projectId?._id || driver.projectId || null;
  let projectRatePerDriver = null;
  if (driver.currentProjectAssignmentId) {
    const assignment = await DriverProjectAssignment.findById(
      driver.currentProjectAssignmentId
    );
    if (assignment && assignment.status === 'active') {
      projectRatePerDriver = assignment.ratePerDriver;
      projectId = assignment.projectId;
    }
  }

  // 9. Create SalaryRun document
  const resolvedClientId = driver.clientId || requestClientId;
  const resolvedBatchId = attendanceBatchId || (attendance.batchId?._id || attendance.batchId);
  const salaryRun = await SalaryRun.create({
    driverId,
    clientId: resolvedClientId,
    attendanceBatchId: resolvedBatchId,
    projectId: projectId || undefined,
    projectRatePerDriver: projectRatePerDriver || undefined,
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
    deductionCarryover,
    status: 'draft',
    processedBy,
    notes: deductionCarryover > 0
      ? `Deduction carryover of ${deductionCarryover} AED to next month`
      : undefined,
  });

  // Store carryover for next month if needed
  if (deductionCarryover > 0) {
    await storeDeductionCarryover(req, driverId, year, month, deductionCarryover);
  }

  return salaryRun;
};

/**
 * Calculate all deductions for a driver in a given period.
 */
const calculateDeductions = async (req, driverId, year, month, grossSalary) => {
  const Driver = getModel(req, 'Driver');
  const Supplier = getModel(req, 'Supplier');
  const DriverLedger = getModel(req, 'DriverLedger');
  const Advance = getModel(req, 'Advance');
  const DriverAdvance = getModel(req, 'DriverAdvance');
  const CreditNote = getModel(req, 'CreditNote');

  const deductions = [];

  // a) TelecomSim bill-based charge
  const driver = await Driver.findById(driverId);
  const SimBill = getModel(req, 'SimBill');
  const simBills = await SimBill.find({
    'allocations': {
      $elemMatch: {
        driverId: driverId,
        status: 'allocated',
        deductedInSalaryRunId: null,
      },
    },
    'period.year': year,
    'period.month': month,
  });

  for (const bill of simBills) {
    for (const alloc of bill.allocations) {
      if (
        alloc.driverId.toString() === driverId.toString() &&
        alloc.status === 'allocated' &&
        !alloc.deductedInSalaryRunId
      ) {
        if (driver.deductSimCharges || alloc.isExtra) {
          deductions.push({
            type: 'telecom_sim',
            referenceId: `${bill._id}:${alloc._id}`,
            amount: alloc.allocatedAmount,
            description: `SIM ${bill.simNumber} — ${alloc.daysUsed}/${alloc.totalDaysInPeriod} days (${bill.invoiceNumber})`,
            status: 'applied',
          });
        }
      }
    }
  }

  // Fallback: if no SimBill exists but driver has a SIM assigned, use flat rate
  if (simBills.length === 0 && driver.telecomSimId) {
    deductions.push({
      type: 'telecom_sim',
      referenceId: String(driver.telecomSimId),
      amount: SALARY.TELECOM_SIM_MONTHLY_CHARGE,
      description: 'Monthly telecom SIM charge (flat rate)',
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
    isDeleted: { $ne: true },
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

  // d) Advance recovery — legacy Advance model
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

  // d2) Advance recovery — DriverAdvance with approved recovery schedule
  const scheduledAdvances = await DriverAdvance.find({
    driverId,
    status: 'approved',
    'recoverySchedule': {
      $elemMatch: {
        'period.year': year,
        'period.month': month,
        recovered: false,
      },
    },
  });

  for (const advance of scheduledAdvances) {
    const installment = advance.recoverySchedule.find(
      (s) => parseInt(s.period.year) === year && parseInt(s.period.month) === month && !s.recovered
    );
    if (!installment || installment.amountToRecover <= 0) continue;

    deductions.push({
      type: 'advance_recovery',
      referenceId: String(advance._id),
      amount: Math.round(installment.amountToRecover * 100) / 100,
      description: `Advance recovery installment #${installment.installmentNo} (${advance.reason})`,
      status: 'applied',
    });
  }

  // e) Penalties — check DriverLedger for penalty entries in this period
  const penaltyEntries = await DriverLedger.find({
    driverId,
    entryType: 'penalty',
    'period.year': year,
    'period.month': month,
    isDeleted: { $ne: true },
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

  // f) Vehicle fines — auto-deduct fines/salik/damages from the driver who had the vehicle
  const VehicleFine = getModel(req, 'VehicleFine');
  const pendingFines = await VehicleFine.find({
    driverId,
    status: 'pending',
    'deductionPeriod.year': year,
    'deductionPeriod.month': month,
  });

  for (const fine of pendingFines) {
    deductions.push({
      type: fine.fineType === 'salik' ? 'salik' : 'vehicle_fine',
      referenceId: String(fine._id),
      amount: fine.amount,
      description: `${fine.fineType.replace(/_/g, ' ')} — ${fine.vehiclePlate}${fine.description ? ': ' + fine.description : ''}`,
      status: 'applied',
    });
  }

  // g) Credit note deductions — unsettled CN line items for this driver
  //    Excludes lines where a DriverReceivable was already created (resigned/offboarded)
  const unsettledCNLines = await CreditNote.find({
    'lineItems': {
      $elemMatch: {
        driverId: driverId,
        salaryDeducted: false,
        manuallyResolved: false,
        receivableCreated: { $ne: true },
      },
    },
    status: { $in: ['sent', 'adjusted'] },
    isDeleted: { $ne: true },
  });

  for (const cn of unsettledCNLines) {
    for (const line of cn.lineItems) {
      if (
        line.driverId.toString() === driverId.toString() &&
        !line.salaryDeducted &&
        !line.manuallyResolved &&
        !line.receivableCreated
      ) {
        deductions.push({
          type: 'credit_note',
          referenceId: String(cn._id) + ':' + String(line._id),
          amount: Math.round(line.totalWithVat * 100) / 100,
          description: `${cn.creditNoteNo} - ${(line.noteType || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}${line.referenceNo ? ' - ' + line.referenceNo : ''}`,
          status: 'applied',
        });

        // Clear pendingNextSalary flag since it's now being included in this salary run
        if (line.pendingNextSalary) {
          line.pendingNextSalary = false;
          await cn.save();
        }
      }
    }
  }

  // h) Visa cost monthly recovery (company-sponsored visa / TWP)
  //    Only applied when there is an active DriverVisa record with a non-zero
  //    monthlyDeduction and an outstanding balance. Finance can excuse a given
  //    month via the manual salary adjustment endpoint (which removes/reduces
  //    this line on the salary run).
  const driverVisaService = require('./driverVisa.service');
  const visaResult = await driverVisaService.resolveVisaDeductionForDriver(req, driverId);
  if (visaResult) {
    deductions.push(visaResult.deduction);
  }

  // f) Deduction carryover from previous month
  const carryover = await getDeductionCarryover(req, driverId, year, month);
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
 * Idempotent: removes any existing carryover for the same source period before creating.
 */
const storeDeductionCarryover = async (req, driverId, year, month, amount) => {
  const DriverLedger = getModel(req, 'DriverLedger');

  // Calculate next month
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
};

/**
 * Clear deduction carryover for a given source period.
 */
const clearDeductionCarryover = async (req, driverId, year, month) => {
  const DriverLedger = getModel(req, 'DriverLedger');

  await DriverLedger.deleteMany({
    driverId,
    referenceId: `carryover_${year}_${month}`,
    entryType: 'manual_debit',
  });
};

/**
 * Get deduction carryover from the previous month.
 * Sums all matching carryover entries (in case of duplicates) and excludes deleted entries.
 */
const getDeductionCarryover = async (req, driverId, year, month) => {
  const DriverLedger = getModel(req, 'DriverLedger');

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
};

/**
 * Run payroll for all active drivers of a client for a given period.
 */
const runPayroll = async (req, clientId, projectId, year, month, processedBy) => {
  const Project = getModel(req, 'Project');
  const AttendanceRecord = getModel(req, 'AttendanceRecord');
  const AttendanceBatch = getModel(req, 'AttendanceBatch');

  // 1. Resolve clientId from project to ensure consistency with stored records
  if (projectId) {
    const project = await Project.findById(projectId).select('clientId');
    if (project) {
      clientId = project.clientId;
    }
  }

  // 2. Find all active drivers for this client/project with approved attendance
  const query = {
    clientId,
    'period.year': year,
    'period.month': month,
    status: { $in: ['valid', 'warning', 'overridden'] },
  };
  if (projectId) {
    query.projectId = projectId;
  }

  const attendanceRecords = await AttendanceRecord.find(query).populate('batchId');

  // Filter to only those with approved batches
  const approvedRecords = attendanceRecords.filter(
    (r) => r.batchId && ['fully_approved', 'invoiced', 'processed'].includes(r.batchId.status)
  );

  if (approvedRecords.length === 0) {
    const detail = attendanceRecords.length > 0
      ? `Found ${attendanceRecords.length} attendance record(s) but none with an approved batch (batch statuses: ${[...new Set(attendanceRecords.map((r) => r.batchId?.status || 'unknown'))].join(', ')})`
      : 'No attendance records found for this client/project/period';
    const err = new Error(detail);
    err.statusCode = 404;
    throw err;
  }

  // 3. Calculate salary for each driver
  const runs = [];
  const errors = [];
  let totalGross = 0;
  let totalDeductions = 0;
  let totalNet = 0;

  for (const record of approvedRecords) {
    try {
      const salaryRun = await calculateDriverSalary(
        req,
        record.driverId,
        year,
        month,
        processedBy,
        { clientId, attendanceBatchId: record.batchId?._id || record.batchId }
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

  // 4. Ledger entries are posted on approval, not on draft creation

  // 5. Update advance records
  for (const run of runs) {
    await updateAdvanceRecoveries(req, run);
  }

  // 6. Mark attendance batch as processed
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
const postLedgerEntries = async (req, salaryRun, createdBy) => {
  const DriverLedger = getModel(req, 'DriverLedger');

  const { driverId, period } = salaryRun;

  // Get the last running balance for this driver
  const lastEntry = await DriverLedger.findOne({ driverId, isDeleted: { $ne: true } })
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
const updateAdvanceRecoveries = async (req, salaryRun) => {
  const Advance = getModel(req, 'Advance');
  const DriverAdvance = getModel(req, 'DriverAdvance');

  const advanceDeductions = salaryRun.deductions.filter(
    (d) => d.type === 'advance_recovery'
  );

  const { year, month } = salaryRun.period;

  for (const deduction of advanceDeductions) {
    if (!deduction.referenceId) continue;

    // Try legacy Advance model first
    const advance = await Advance.findById(deduction.referenceId);
    if (advance) {
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
      continue;
    }

    // Try DriverAdvance model (scheduled installments)
    const driverAdvance = await DriverAdvance.findById(deduction.referenceId);
    if (!driverAdvance) continue;

    const installment = driverAdvance.recoverySchedule.find(
      (s) => parseInt(s.period.year) === year && parseInt(s.period.month) === month && !s.recovered
    );

    if (installment) {
      installment.recovered = true;
      installment.recoveredAt = new Date();
      installment.salaryRunId = salaryRun._id;
    }

    driverAdvance.totalRecovered += deduction.amount;

    // Mark fully recovered if all installments done
    const allRecovered = driverAdvance.recoverySchedule.every((s) => s.recovered);
    if (allRecovered || driverAdvance.totalRecovered >= driverAdvance.amount) {
      driverAdvance.status = 'fully_recovered';
    }

    await driverAdvance.save();
  }
};

/**
 * Sync credit note deductions into an existing salary run.
 * Picks up any unsettled CN lines that were sent AFTER the salary run was created.
 * Called before ops approval to ensure all deductions are current.
 */
const syncCreditNoteDeductions = async (req, salaryRun) => {
  const CreditNote = getModel(req, 'CreditNote');
  const DriverLedger = getModel(req, 'DriverLedger');

  const driverId = salaryRun.driverId;
  let changed = false;

  const unsettledCNs = await CreditNote.find({
    'lineItems': {
      $elemMatch: {
        driverId: driverId,
        salaryDeducted: false,
        manuallyResolved: false,
        receivableCreated: { $ne: true },
      },
    },
    status: { $in: ['sent', 'adjusted'] },
    isDeleted: { $ne: true },
  });

  for (const cn of unsettledCNs) {
    for (const line of cn.lineItems) {
      if (
        line.driverId.toString() !== driverId.toString() ||
        line.salaryDeducted ||
        line.manuallyResolved ||
        line.receivableCreated
      ) continue;

      const refId = String(cn._id) + ':' + String(line._id);

      // Skip if already present in this salary run
      const alreadyAdded = salaryRun.deductions.some(
        (d) => d.type === 'credit_note' && d.referenceId === refId
      );
      if (alreadyAdded) continue;

      const deductionAmount = Math.round(line.totalWithVat * 100) / 100;

      salaryRun.deductions.push({
        type: 'credit_note',
        referenceId: refId,
        amount: deductionAmount,
        description: `${cn.creditNoteNo} - ${(line.noteType || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}${line.referenceNo ? ' - ' + line.referenceNo : ''}`,
        status: 'applied',
      });

      // Clear pendingNextSalary flag
      if (line.pendingNextSalary) {
        line.pendingNextSalary = false;
        await cn.save();
      }

      changed = true;
    }
  }

  if (changed) {
    salaryRun.totalDeductions = Math.round(
      salaryRun.deductions.filter((d) => d.amount > 0).reduce((sum, d) => sum + d.amount, 0) * 100
    ) / 100;
    const rawNet = Math.round((salaryRun.grossSalary - salaryRun.totalDeductions) * 100) / 100;

    if (rawNet < 0) {
      const carryoverAmount = Math.abs(rawNet);
      salaryRun.netSalary = 0;
      salaryRun.deductionCarryover = carryoverAmount;
      salaryRun.notes = `Deduction carryover of ${carryoverAmount} AED to next month`;

      // Remove any existing carryover ledger entry and store updated one
      const { year, month } = salaryRun.period;
      let nextMonth = month + 1;
      let nextYear = year;
      if (nextMonth > 12) { nextMonth = 1; nextYear = year + 1; }

      await DriverLedger.deleteMany({
        driverId: salaryRun.driverId,
        referenceId: `carryover_${year}_${month}`,
        'period.year': nextYear,
        'period.month': nextMonth,
        entryType: 'manual_debit',
      });

      await storeDeductionCarryover(req, salaryRun.driverId, year, month, carryoverAmount);
    } else {
      salaryRun.netSalary = rawNet;
      salaryRun.deductionCarryover = 0;

      // Clear any previously stored carryover if net is now positive
      const { year, month } = salaryRun.period;
      let nextMonth = month + 1;
      let nextYear = year;
      if (nextMonth > 12) { nextMonth = 1; nextYear = year + 1; }

      await DriverLedger.deleteMany({
        driverId: salaryRun.driverId,
        referenceId: `carryover_${year}_${month}`,
        'period.year': nextYear,
        'period.month': nextMonth,
        entryType: 'manual_debit',
      });

      if (salaryRun.notes && salaryRun.notes.startsWith('Deduction carryover')) {
        salaryRun.notes = undefined;
      }
    }
  }

  return changed;
};

/**
 * Operations approval — draft → ops_approved
 */
const approveByOps = async (req, runId, userId, remarks) => {
  const SalaryRun = getModel(req, 'SalaryRun');

  const salaryRun = await SalaryRun.findById(runId);
  if (!salaryRun) {
    const err = new Error('Salary run not found');
    err.statusCode = 404;
    throw err;
  }

  if (salaryRun.status !== 'draft') {
    const err = new Error(`Cannot perform operations approval — salary run must be in 'draft' status (current: '${salaryRun.status}')`);
    err.statusCode = 400;
    throw err;
  }

  // Sync any credit note deductions that were sent after this salary run was created
  await syncCreditNoteDeductions(req, salaryRun);

  salaryRun.approvals.push({ stage: 'salary.approve_ops', approvedBy: userId, approvedAt: new Date(), remarks });
  salaryRun.status = 'ops_approved';
  await salaryRun.save();

  // Notify users with compliance approval permission
  const { notifyByPermission } = require('./notification.service');
  await notifyByPermission('salary.approve_compliance', {
    type: 'salary_ops_approved',
    title: 'Salary run ready for compliance review',
    message: `Salary run ${salaryRun.runId} has been approved by Operations and is awaiting compliance review.`,
    referenceModel: 'SalaryRun',
    referenceId: salaryRun._id,
    triggeredBy: userId,
  });

  return salaryRun;
};

/**
 * Compliance approval — ops_approved → compliance_approved
 */
const approveByCompliance = async (req, runId, userId, remarks) => {
  const SalaryRun = getModel(req, 'SalaryRun');

  const salaryRun = await SalaryRun.findById(runId);
  if (!salaryRun) {
    const err = new Error('Salary run not found');
    err.statusCode = 404;
    throw err;
  }

  if (salaryRun.status !== 'ops_approved') {
    const err = new Error(`Cannot perform compliance approval — salary run must be in 'ops_approved' status (current: '${salaryRun.status}')`);
    err.statusCode = 400;
    throw err;
  }

  salaryRun.approvals.push({ stage: 'salary.approve_compliance', approvedBy: userId, approvedAt: new Date(), remarks });
  salaryRun.status = 'compliance_approved';
  await salaryRun.save();

  // Notify users with accounts approval permission
  const { notifyByPermission } = require('./notification.service');
  await notifyByPermission('salary.approve_accounts', {
    type: 'salary_compliance_approved',
    title: 'Salary run ready for accounts review',
    message: `Salary run ${salaryRun.runId} has been approved by Compliance and is awaiting accounts review.`,
    referenceModel: 'SalaryRun',
    referenceId: salaryRun._id,
    triggeredBy: userId,
  });

  return salaryRun;
};

/**
 * Junior Accounts approval — compliance_approved → accounts_approved
 */
const approveByAccounts = async (req, runId, userId, remarks) => {
  const SalaryRun = getModel(req, 'SalaryRun');

  const salaryRun = await SalaryRun.findById(runId);
  if (!salaryRun) {
    const err = new Error('Salary run not found');
    err.statusCode = 404;
    throw err;
  }

  if (salaryRun.status !== 'compliance_approved') {
    const err = new Error(`Cannot perform accounts approval — salary run must be in 'compliance_approved' status (current: '${salaryRun.status}')`);
    err.statusCode = 400;
    throw err;
  }

  salaryRun.approvals.push({ stage: 'salary.approve_accounts', approvedBy: userId, approvedAt: new Date(), remarks });
  salaryRun.status = 'accounts_approved';
  await salaryRun.save();

  // Notify users with salary.process permission
  const { notifyByPermission } = require('./notification.service');
  await notifyByPermission('salary.process', {
    type: 'salary_accounts_approved',
    title: 'Salary run ready for processing',
    message: `Salary run ${salaryRun.runId} has received all approvals and is ready to be processed.`,
    referenceModel: 'SalaryRun',
    referenceId: salaryRun._id,
    triggeredBy: userId,
  });

  return salaryRun;
};

/**
 * Finance processes — accounts_approved → processed
 */
const processSalaryRun = async (req, runId, userId) => {
  const SalaryRun = getModel(req, 'SalaryRun');
  const DriverLedger = getModel(req, 'DriverLedger');
  const CreditNote = getModel(req, 'CreditNote');

  const salaryRun = await SalaryRun.findById(runId);
  if (!salaryRun) {
    const err = new Error('Salary run not found');
    err.statusCode = 404;
    throw err;
  }

  if (salaryRun.status !== 'accounts_approved') {
    const err = new Error(`Cannot process salary run — must be in 'accounts_approved' status (current: '${salaryRun.status}')`);
    err.statusCode = 400;
    throw err;
  }

  // Verify all 3 approvals exist
  const stages = salaryRun.approvals.map(a => a.stage);
  for (const required of ['salary.approve_ops', 'salary.approve_compliance', 'salary.approve_accounts']) {
    if (!stages.includes(required)) {
      const err = new Error(`Missing '${required}' approval — cannot process salary run`);
      err.statusCode = 400;
      throw err;
    }
  }

  salaryRun.status = 'processed';
  salaryRun.processedBy = userId;
  salaryRun.processedAt = new Date();
  await salaryRun.save();

  // Post ledger entries on processing (moved from old approval step)
  await postLedgerEntries(req, salaryRun, userId);

  // Update advance recoveries
  await updateAdvanceRecoveries(req, salaryRun);

  // Update visa cost recovery on the corresponding DriverVisa record(s).
  // Only the amount still present on the salary run (post Finance adjustments)
  // is credited, so excused months don't increment totalRecovered.
  const driverVisaSvc = require('./driverVisa.service');
  await driverVisaSvc.recordVisaRecovery(req, salaryRun.driverId, salaryRun);

  // Mark SIM bill allocations as deducted
  const simDeductions = (salaryRun.deductions || []).filter(d => d.type === 'telecom_sim' && d.referenceId && d.referenceId.includes(':'));
  if (simDeductions.length > 0) {
    const SimBill = getModel(req, 'SimBill');
    for (const ded of simDeductions) {
      const [billId, allocId] = ded.referenceId.split(':');
      if (!billId || !allocId) continue;
      await SimBill.findOneAndUpdate(
        { _id: billId, 'allocations._id': allocId },
        {
          $set: {
            'allocations.$.deductedInSalaryRunId': salaryRun._id,
            'allocations.$.status': 'deducted',
          },
        }
      );
    }
  }

  // Mark credit note lines as salary-deducted
  const creditNoteDeductions = (salaryRun.deductions || []).filter(d => d.type === 'credit_note');
  for (const ded of creditNoteDeductions) {
    if (!ded.referenceId) continue;
    const [cnId, lineId] = ded.referenceId.split(':');
    if (!cnId || !lineId) continue;

    await CreditNote.findOneAndUpdate(
      { _id: cnId, 'lineItems._id': lineId },
      {
        $set: {
          'lineItems.$.salaryDeducted': true,
          'lineItems.$.salaryDeductedAt': new Date(),
          'lineItems.$.salaryRunId': salaryRun._id,
        },
      }
    );

    // Post debit entry to DriverLedger
    const lastEntry = await DriverLedger.findOne({ driverId: salaryRun.driverId, isDeleted: { $ne: true } })
      .sort({ createdAt: -1 });
    const previousBalance = lastEntry?.runningBalance || 0;

    await DriverLedger.create({
      driverId: salaryRun.driverId,
      salaryRunId: salaryRun._id,
      entryType: 'credit_note_debit',
      debit: ded.amount,
      credit: 0,
      runningBalance: previousBalance - ded.amount,
      description: ded.description,
      referenceId: ded.referenceId,
      period: salaryRun.period,
      createdBy: userId,
    });

    // Check if entire CN is now settled
    const { checkAndSettleCreditNote } = require('./creditNote.service');
    await checkAndSettleCreditNote(cnId);
  }

  // Mark vehicle fines as deducted
  const vehicleFineDeductions = (salaryRun.deductions || []).filter(
    (d) => d.type === 'vehicle_fine' || (d.type === 'salik' && d.referenceId && /^[0-9a-fA-F]{24}$/.test(d.referenceId))
  );
  if (vehicleFineDeductions.length > 0) {
    const VehicleFine = getModel(req, 'VehicleFine');
    for (const ded of vehicleFineDeductions) {
      if (!ded.referenceId) continue;
      await VehicleFine.findByIdAndUpdate(ded.referenceId, {
        $set: { status: 'deducted', salaryRunId: salaryRun._id },
      });
    }
  }

  // Notify users with salary.pay permission
  const { notifyByPermission } = require('./notification.service');
  await notifyByPermission('salary.pay', {
    type: 'salary_processed',
    title: 'Salary run processed',
    message: `Salary run ${salaryRun.runId} has been processed and is ready for payment.`,
    referenceModel: 'SalaryRun',
    referenceId: salaryRun._id,
    triggeredBy: userId,
  });

  return salaryRun;
};

/**
 * Generate WPS (Wages Protection System) SIF file content for a period.
 */
const generateWpsFile = async (req, clientId, year, month) => {
  const SalaryRun = getModel(req, 'SalaryRun');
  const query = {
    'period.year': year,
    'period.month': month,
    status: { $in: ['approved', 'processed', 'paid'] },
    isDeleted: { $ne: true },
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

/**
 * Add a manual deduction to a salary run (by authorized role).
 * Supported types: telecom_sim, vehicle_rental, salik, advance_recovery, penalty, deduction_carryover
 */
const addManualDeduction = async (req, runId, { type, amount, description }, addedBy) => {
  const SalaryRun = getModel(req, 'SalaryRun');
  const { DEDUCTION_TYPES } = require('../config/constants');

  if (!DEDUCTION_TYPES.includes(type)) {
    const err = new Error(`Invalid deduction type "${type}". Allowed: ${DEDUCTION_TYPES.join(', ')}`);
    err.statusCode = 400;
    throw err;
  }

  const salaryRun = await SalaryRun.findById(runId);
  if (!salaryRun) {
    const err = new Error('Salary run not found');
    err.statusCode = 404;
    throw err;
  }

  const blockedStatuses = ['processed', 'paid', 'approved'];
  if (blockedStatuses.includes(salaryRun.status)) {
    const err = new Error(`Cannot add deductions to a ${salaryRun.status} salary run`);
    err.statusCode = 400;
    throw err;
  }

  const deductionAmount = Math.round(parseFloat(amount) * 100) / 100;
  if (deductionAmount <= 0) {
    const err = new Error('Deduction amount must be greater than zero');
    err.statusCode = 400;
    throw err;
  }

  salaryRun.deductions.push({
    type,
    referenceId: null,
    amount: deductionAmount,
    description: description || `Manual ${type.replace(/_/g, ' ')} deduction`,
    status: 'applied',
  });

  salaryRun.totalDeductions = Math.round(
    salaryRun.deductions.filter((d) => d.amount > 0).reduce((sum, d) => sum + d.amount, 0) * 100
  ) / 100;

  const rawNet = Math.round((salaryRun.grossSalary - salaryRun.totalDeductions) * 100) / 100;
  const { year, month } = salaryRun.period;

  // Handle negative balance: cap at 0 and store carryover for next month
  if (rawNet < 0) {
    const carryoverAmount = Math.abs(rawNet);
    salaryRun.netSalary = 0;
    salaryRun.deductionCarryover = carryoverAmount;
    salaryRun.notes = `Deduction carryover of ${carryoverAmount} AED to next month`;

    // storeDeductionCarryover is idempotent — cleans up old entries automatically
    await storeDeductionCarryover(req, salaryRun.driverId, year, month, carryoverAmount);
  } else {
    salaryRun.netSalary = rawNet;
    salaryRun.deductionCarryover = 0;

    // Clear any previously stored carryover if net is now positive
    await clearDeductionCarryover(req, salaryRun.driverId, year, month);

    if (salaryRun.notes && salaryRun.notes.startsWith('Deduction carryover')) {
      salaryRun.notes = undefined;
    }
  }

  await salaryRun.save();
  return salaryRun;
};

/**
 * Bulk approve salary runs for a given stage.
 * Iterates through each ID, applies the stage-specific approval, and tracks successes/errors.
 */
const bulkApproveByOps = async (req, runIds, userId, remarks) => {
  const results = { approved: [], errors: [] };
  for (const runId of runIds) {
    try {
      const run = await approveByOps(req, runId, userId, remarks);
      results.approved.push({ _id: run._id, runId: run.runId, status: run.status });
    } catch (err) {
      results.errors.push({ _id: runId, error: err.message });
    }
  }
  return results;
};

const bulkApproveByCompliance = async (req, runIds, userId, remarks) => {
  const results = { approved: [], errors: [] };
  for (const runId of runIds) {
    try {
      const run = await approveByCompliance(req, runId, userId, remarks);
      results.approved.push({ _id: run._id, runId: run.runId, status: run.status });
    } catch (err) {
      results.errors.push({ _id: runId, error: err.message });
    }
  }
  return results;
};

const bulkApproveByAccounts = async (req, runIds, userId, remarks) => {
  const results = { approved: [], errors: [] };
  for (const runId of runIds) {
    try {
      const run = await approveByAccounts(req, runId, userId, remarks);
      results.approved.push({ _id: run._id, runId: run.runId, status: run.status });
    } catch (err) {
      results.errors.push({ _id: runId, error: err.message });
    }
  }
  return results;
};

const bulkProcess = async (req, runIds, userId) => {
  const results = { processed: [], errors: [] };
  for (const runId of runIds) {
    try {
      const run = await processSalaryRun(req, runId, userId);
      results.processed.push({ _id: run._id, runId: run.runId, status: run.status });
    } catch (err) {
      results.errors.push({ _id: runId, error: err.message });
    }
  }
  return results;
};

const bulkMarkAsPaid = async (req, runIds, userId) => {
  const SalaryRun = getModel(req, 'SalaryRun');

  const results = { paid: [], errors: [] };
  for (const runId of runIds) {
    try {
      const salaryRun = await SalaryRun.findById(runId);
      if (!salaryRun) {
        throw new Error('Salary run not found');
      }
      if (salaryRun.status !== 'approved' && salaryRun.status !== 'processed') {
        throw new Error(`Cannot mark a ${salaryRun.status} salary run as paid — must be 'processed' or 'approved'`);
      }
      salaryRun.status = 'paid';
      salaryRun.paidAt = new Date();
      await salaryRun.save();
      results.paid.push({ _id: salaryRun._id, runId: salaryRun.runId, status: salaryRun.status });
    } catch (err) {
      results.errors.push({ _id: runId, error: err.message });
    }
  }
  return results;
};

module.exports = {
  calculateDriverSalary,
  calculateDeductions,
  syncCreditNoteDeductions,
  runPayroll,
  postLedgerEntries,
  approveByOps,
  approveByCompliance,
  approveByAccounts,
  processSalaryRun,
  bulkApproveByOps,
  bulkApproveByCompliance,
  bulkApproveByAccounts,
  bulkProcess,
  bulkMarkAsPaid,
  generateWpsFile,
  addManualDeduction,
};
