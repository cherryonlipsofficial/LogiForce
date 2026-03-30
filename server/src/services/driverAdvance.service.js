const { DriverAdvance, Driver, User, DriverLedger } = require('../models');
const { notifyByRole, notifyUsers } = require('./notification.service');

/**
 * Request a salary advance for a driver.
 */
async function requestAdvance(data, requestedByUserId) {
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
  await notifyByRole(['accountant'], {
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
async function reviewAdvance(advanceId, decision, reviewData, reviewerUserId) {
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
  const lastEntry = await DriverLedger.findOne({ driverId: advance.driverId._id || advance.driverId })
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
