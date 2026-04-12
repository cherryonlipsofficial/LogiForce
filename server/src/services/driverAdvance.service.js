const { getModel } = require('../config/modelRegistry');
const { notifyByPermission, notifyUsers } = require('../modules/shared/notification.service');

/**
 * Request a salary advance for a driver.
 */
async function requestAdvance(req, data, requestedByUserId) {
  const DriverAdvance = getModel(req, 'DriverAdvance');
  const Driver = getModel(req, 'Driver');
  const User = getModel(req, 'User');

  // Validate driver is active
  const driver = await Driver.findById(data.driverId).select(
    'fullName status clientId projectId'
  );
  if (!driver)
    throw Object.assign(new Error('Driver not found'), { statusCode: 404 });
  if (driver.status !== 'active') {
    throw Object.assign(
      new Error(
        `Only active drivers can receive advances. Driver status: "${driver.status}"`
      ),
      { statusCode: 400 }
    );
  }

  // Check for existing pending advance for same driver
  const existing = await DriverAdvance.findOne({
    driverId: data.driverId,
    status: 'pending',
  });
  if (existing) {
    throw Object.assign(
      new Error(
        'This driver already has a pending advance request. Wait for it to be resolved.'
      ),
      { statusCode: 400 }
    );
  }

  const requestingUser = await User.findById(requestedByUserId)
    .select('name roleId')
    .populate('roleId', 'name');

  const advance = await DriverAdvance.create({
    driverId: data.driverId,
    projectId: data.projectId || driver.projectId,
    clientId: data.clientId || driver.clientId,
    requestedBy: requestedByUserId,
    requestedByName: requestingUser.name,
    requestedByRole: requestingUser.roleId?.name,
    amount: data.amount,
    reason: data.reason,
    status: 'pending',
  });

  // Notify Accounts users
  await notifyByPermission('advances.approve', {
    type: 'advance_requested',
    title: 'Driver advance request',
    message: `${requestingUser.name} requested AED ${data.amount} advance for driver ${driver.fullName}. Reason: ${data.reason}`,
    referenceModel: 'DriverAdvance',
    referenceId: advance._id,
    triggeredBy: requestedByUserId,
    triggeredByName: requestingUser.name,
  });

  return advance;
}

/**
 * Approve or reject a pending advance request.
 */
async function reviewAdvance(req, advanceId, decision, reviewData, reviewerUserId) {
  const DriverAdvance = getModel(req, 'DriverAdvance');
  const User = getModel(req, 'User');
  const DriverLedger = getModel(req, 'DriverLedger');
  const SalaryRun = getModel(req, 'SalaryRun');

  const advance = await DriverAdvance.findById(advanceId).populate(
    'driverId',
    'fullName'
  );

  if (!advance)
    throw Object.assign(new Error('Advance not found'), { statusCode: 404 });
  if (advance.status !== 'pending') {
    throw Object.assign(
      new Error('This advance has already been reviewed.'),
      { statusCode: 400 }
    );
  }

  const reviewer = await User.findById(reviewerUserId).select('name');

  if (decision === 'rejected') {
    advance.status = 'rejected';
    advance.reviewedBy = reviewerUserId;
    advance.reviewedByName = reviewer.name;
    advance.reviewedAt = new Date();
    advance.reviewNotes = reviewData.reviewNotes;
    await advance.save();

    // Notify requester
    await notifyUsers([advance.requestedBy], {
      type: 'advance_rejected',
      title: 'Advance request rejected',
      message: `Your advance request of AED ${advance.amount} for ${advance.driverId.fullName} has been rejected.${reviewData.reviewNotes ? ' Reason: ' + reviewData.reviewNotes : ''}`,
      referenceModel: 'DriverAdvance',
      referenceId: advance._id,
      triggeredBy: reviewerUserId,
      triggeredByName: reviewer.name,
    });

    return advance;
  }

  // Approved — validate recovery schedule
  if (!reviewData.recoverySchedule || !reviewData.recoverySchedule.length) {
    throw Object.assign(
      new Error('Recovery schedule is required when approving an advance.'),
      { statusCode: 400 }
    );
  }

  const scheduleTotal = reviewData.recoverySchedule.reduce(
    (sum, s) => sum + parseFloat(s.amountToRecover),
    0
  );

  if (Math.abs(scheduleTotal - advance.amount) > 0.01) {
    throw Object.assign(
      new Error(
        `Recovery schedule total (AED ${scheduleTotal}) must equal advance amount (AED ${advance.amount}).`
      ),
      { statusCode: 400 }
    );
  }

  // Build schedule with installment numbers (ensure period values are integers)
  const schedule = reviewData.recoverySchedule.map((s, idx) => ({
    installmentNo: idx + 1,
    period: {
      year: parseInt(s.period.year),
      month: parseInt(s.period.month),
    },
    amountToRecover: parseFloat(s.amountToRecover),
    recovered: false,
  }));

  advance.status = 'approved';
  advance.reviewedBy = reviewerUserId;
  advance.reviewedByName = reviewer.name;
  advance.reviewedAt = new Date();
  advance.reviewNotes = reviewData.reviewNotes;
  advance.recoverySchedule = schedule;
  advance.totalRecovered = 0;
  await advance.save();

  // Post ledger entry for the approved advance
  const lastEntry = await DriverLedger.findOne({ driverId: advance.driverId._id || advance.driverId, isDeleted: { $ne: true } })
    .sort({ createdAt: -1 });
  const previousBalance = lastEntry?.runningBalance || 0;

  await DriverLedger.create({
    driverId: advance.driverId._id || advance.driverId,
    entryType: 'advance_issued',
    debit: advance.amount,
    credit: 0,
    runningBalance: previousBalance - advance.amount,
    description: `Advance issued – AED ${advance.amount}${reviewData.reviewNotes ? ' (' + reviewData.reviewNotes + ')' : ''}`,
    referenceId: advance._id.toString(),
    createdBy: reviewerUserId,
  });

  // Update any existing unprocessed salary runs for this driver/period
  for (const installment of schedule) {
    const salaryRun = await SalaryRun.findOne({
      driverId: advance.driverId._id || advance.driverId,
      'period.year': installment.period.year,
      'period.month': installment.period.month,
      status: { $in: ['draft', 'ops_approved', 'compliance_approved', 'accounts_approved'] },
      isDeleted: { $ne: true },
    });

    if (salaryRun) {
      // Reload advance to get the saved installment _id
      const savedAdvance = await DriverAdvance.findById(advance._id);
      const savedInstallment = savedAdvance.recoverySchedule.find(
        (s) =>
          parseInt(s.period.year) === installment.period.year &&
          parseInt(s.period.month) === installment.period.month &&
          s.installmentNo === installment.installmentNo
      );

      const deductionEntry = {
        advanceId: advance._id,
        scheduleId: savedInstallment._id,
        amount: installment.amountToRecover,
        description: `Advance recovery — installment ${installment.installmentNo}`,
      };

      salaryRun.advanceDeductions.push(deductionEntry);

      // Also add to the deductions array so it shows in breakdown
      salaryRun.deductions.push({
        type: 'advance_recovery',
        referenceId: String(advance._id),
        amount: installment.amountToRecover,
        description: `Advance recovery installment #${installment.installmentNo} (${advance.reason || 'advance'})`,
        status: 'applied',
      });

      salaryRun.totalDeductions = Math.round(
        (salaryRun.totalDeductions + installment.amountToRecover) * 100
      ) / 100;
      salaryRun.netSalary = Math.round(
        Math.max(0, salaryRun.grossSalary - salaryRun.totalDeductions) * 100
      ) / 100;

      await salaryRun.save();
    }
  }

  // Notify requester
  await notifyUsers([advance.requestedBy], {
    type: 'advance_approved',
    title: 'Advance request approved',
    message: `Advance of AED ${advance.amount} for ${advance.driverId.fullName} approved. Recovery: ${schedule.length} installment(s).`,
    referenceModel: 'DriverAdvance',
    referenceId: advance._id,
    triggeredBy: reviewerUserId,
    triggeredByName: reviewer.name,
  });

  return advance;
}

module.exports = { requestAdvance, reviewAdvance };
