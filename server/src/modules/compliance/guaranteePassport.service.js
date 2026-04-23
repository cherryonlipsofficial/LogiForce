const { getModel } = require('../../config/modelRegistry');
const { logEvent } = require('../drivers/driverHistory.service');
const { evaluateAndTransition } = require('../drivers/driverStatusEngine.service');

/**
 * Mark driver as having submitted their own passport.
 */
const submitOwnPassport = async (req, driverId, userId) => {
  const Driver = getModel(req, 'Driver');
  const driver = await Driver.findById(driverId);
  if (!driver) {
    const err = new Error('Driver not found');
    err.statusCode = 404;
    throw err;
  }

  driver.isPassportSubmitted = true;
  driver.passportSubmissionType = 'own';
  driver.guaranteePassportValid = null;
  driver.activeGuaranteePassportId = null;
  await driver.save();

  await logEvent(req, driverId, 'field_updated', {
    description: 'Passport submission confirmed (own passport)',
    fieldName: 'isPassportSubmitted',
  }, userId);

  await evaluateAndTransition(req, driverId, userId);

  return driver;
};

/**
 * Record a guarantee passport for a driver.
 */
const recordGuaranteePassport = async (req, driverId, data, userId) => {
  const Driver = getModel(req, 'Driver');
  const GuaranteePassport = getModel(req, 'GuaranteePassport');
  const driver = await Driver.findById(driverId);
  if (!driver) {
    const err = new Error('Driver not found');
    err.statusCode = 404;
    throw err;
  }

  // Close any previously active guarantees
  await GuaranteePassport.updateMany(
    { driverId, status: { $in: ['active', 'extended'] } },
    { $set: { status: 'replaced' } }
  );

  // Create new guarantee
  const guarantee = await GuaranteePassport.create({
    driverId,
    guarantorName: data.guarantorName,
    guarantorRelation: data.guarantorRelation,
    guarantorPhone: data.guarantorPhone,
    guarantorEmployeeCode: data.guarantorEmployeeCode,
    guarantorPassportNumber: data.guarantorPassportNumber,
    guarantorPassportExpiry: data.guarantorPassportExpiry,
    guarantorPassportCopy: data.guarantorPassportCopy,
    submittedDate: data.submittedDate || new Date(),
    status: 'active',
    submittedBy: userId,
  });

  // Update driver
  driver.isPassportSubmitted = true;
  driver.passportSubmissionType = 'guarantee';
  driver.activeGuaranteePassportId = guarantee._id;
  driver.guaranteePassportValid = true;
  await driver.save();

  const expiryFormatted = guarantee.expiryDate.toLocaleDateString('en-GB');
  await logEvent(req, driverId, 'field_updated', {
    description: `Guarantee passport recorded — Guarantor: ${data.guarantorName} (${data.guarantorRelation}), Valid until: ${expiryFormatted}`,
    fieldName: 'isPassportSubmitted',
    metadata: { guaranteeId: guarantee._id },
  }, userId);

  await evaluateAndTransition(req, driverId, userId);

  return { driver, guarantee };
};

/**
 * Request an extension on a guarantee passport.
 */
const requestExtension = async (req, guaranteeId, data, userId) => {
  const GuaranteePassport = getModel(req, 'GuaranteePassport');
  const guarantee = await GuaranteePassport.findById(guaranteeId);
  if (!guarantee) {
    const err = new Error('Guarantee passport not found');
    err.statusCode = 404;
    throw err;
  }

  if (!['active', 'extended'].includes(guarantee.status)) {
    const err = new Error(`Cannot request extension for a ${guarantee.status} guarantee.`);
    err.statusCode = 400;
    throw err;
  }

  if (guarantee.extensionRequest?.status === 'pending') {
    const err = new Error('An extension request is already pending approval.');
    err.statusCode = 400;
    throw err;
  }

  const requestedDays = parseInt(data.requestedDays);
  if (!requestedDays || requestedDays < 1 || requestedDays > 30) {
    const err = new Error('requestedDays must be between 1 and 30.');
    err.statusCode = 400;
    throw err;
  }

  const newExpiryDate = new Date(guarantee.expiryDate);
  newExpiryDate.setDate(newExpiryDate.getDate() + requestedDays);

  guarantee.extensionRequest = {
    requestedBy: userId,
    requestedAt: new Date(),
    requestedDays,
    reason: data.reason,
    status: 'pending',
    newExpiryDate,
  };
  await guarantee.save();

  await logEvent(req, guarantee.driverId, 'field_updated', {
    description: `Guarantee passport extension requested — ${requestedDays} extra days. Reason: ${data.reason}`,
    fieldName: 'guaranteePassportValid',
    metadata: { guaranteeId: guarantee._id },
  }, userId);

  return guarantee;
};

/**
 * Admin reviews (approves/rejects) a pending extension request.
 */
const reviewExtension = async (req, guaranteeId, decision, reviewNotes, adminUserId) => {
  const GuaranteePassport = getModel(req, 'GuaranteePassport');
  const Driver = getModel(req, 'Driver');
  const guarantee = await GuaranteePassport.findById(guaranteeId);
  if (!guarantee || guarantee.extensionRequest?.status !== 'pending') {
    const err = new Error('No pending extension request found.');
    err.statusCode = 400;
    throw err;
  }

  const driver = await Driver.findById(guarantee.driverId);

  if (decision === 'approved') {
    guarantee.expiryDate = guarantee.extensionRequest.newExpiryDate;
    guarantee.status = 'extended';
    guarantee.extensionCount += 1;
    guarantee.extensionRequest.status = 'approved';
    guarantee.extensionRequest.reviewedBy = adminUserId;
    guarantee.extensionRequest.reviewedAt = new Date();
    guarantee.extensionRequest.reviewNotes = reviewNotes;

    if (driver) {
      driver.guaranteePassportValid = true;
      await driver.save();
    }

    const expiryFormatted = guarantee.extensionRequest.newExpiryDate.toLocaleDateString('en-GB');
    await logEvent(req, guarantee.driverId, 'field_updated', {
      description: `Guarantee passport extension APPROVED by admin — New expiry: ${expiryFormatted}`,
      fieldName: 'guaranteePassportValid',
      metadata: { guaranteeId: guarantee._id },
    }, adminUserId);
  } else {
    // rejected
    guarantee.extensionRequest.status = 'rejected';
    guarantee.extensionRequest.reviewedBy = adminUserId;
    guarantee.extensionRequest.reviewedAt = new Date();
    guarantee.extensionRequest.reviewNotes = reviewNotes;

    await logEvent(req, guarantee.driverId, 'field_updated', {
      description: `Guarantee passport extension REJECTED by admin. Reason: ${reviewNotes}`,
      fieldName: 'guaranteePassportValid',
      metadata: { guaranteeId: guarantee._id },
    }, adminUserId);
  }

  await guarantee.save();
  return guarantee;
};

/**
 * Return a guarantee passport (physically returned to guarantor).
 */
const returnGuarantee = async (req, guaranteeId, notes, userId) => {
  const GuaranteePassport = getModel(req, 'GuaranteePassport');
  const Driver = getModel(req, 'Driver');
  const guarantee = await GuaranteePassport.findById(guaranteeId);
  if (!guarantee) {
    const err = new Error('Guarantee passport not found');
    err.statusCode = 404;
    throw err;
  }

  guarantee.status = 'returned';
  guarantee.returnedDate = new Date();
  guarantee.returnedBy = userId;
  guarantee.returnNotes = notes;
  await guarantee.save();

  const driver = await Driver.findById(guarantee.driverId);
  if (driver) {
    driver.isPassportSubmitted = false;
    driver.passportSubmissionType = null;
    driver.activeGuaranteePassportId = null;
    driver.guaranteePassportValid = null;
    await driver.save();
  }

  await logEvent(req, guarantee.driverId, 'field_updated', {
    description: 'Guarantee passport returned to guarantor',
    fieldName: 'isPassportSubmitted',
    metadata: { guaranteeId: guarantee._id },
  }, userId);

  await evaluateAndTransition(req, guarantee.driverId, userId);

  return { driver, guarantee };
};

/**
 * Nightly cron: expire overdue guarantee passports.
 */
const runExpiryCheck = async (req) => {
  const GuaranteePassport = getModel(req, 'GuaranteePassport');
  const Driver = getModel(req, 'Driver');
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const expired = await GuaranteePassport.find({
    status: { $in: ['active', 'extended'] },
    expiryDate: { $lt: today },
  });

  for (const guarantee of expired) {
    guarantee.status = 'expired';
    await guarantee.save();

    await Driver.findByIdAndUpdate(guarantee.driverId, {
      guaranteePassportValid: false,
    });

    await logEvent(req, guarantee.driverId, 'field_updated', {
      description: `Guarantee passport EXPIRED — Guarantor: ${guarantee.guarantorName}. Driver may need new passport or guarantee.`,
      fieldName: 'guaranteePassportValid',
      oldValue: 'true',
      newValue: 'false',
      metadata: { guaranteeId: guarantee._id },
    }, guarantee.submittedBy);
  }

  return { expiredCount: expired.length };
};

/**
 * Get all guarantee passport records for a driver, newest first.
 */
const getGuaranteeHistory = async (req, driverId) => {
  const GuaranteePassport = getModel(req, 'GuaranteePassport');
  return GuaranteePassport.find({ driverId })
    .sort({ createdAt: -1 })
    .populate('submittedBy', 'name')
    .populate('returnedBy', 'name')
    .populate('extensionRequest.requestedBy', 'name')
    .populate('extensionRequest.reviewedBy', 'name')
    .lean();
};

module.exports = {
  submitOwnPassport,
  recordGuaranteePassport,
  requestExtension,
  reviewExtension,
  returnGuarantee,
  runExpiryCheck,
  getGuaranteeHistory,
};
