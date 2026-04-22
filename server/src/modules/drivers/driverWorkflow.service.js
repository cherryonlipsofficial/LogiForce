const { getModel } = require('../../config/modelRegistry');
const { applyStatusChange, evaluateAndTransition, checkKycDocsUploaded, checkKycDocsValid, checkProfileAndEmploymentComplete, REQUIRED_KYC_DOCS, REQUIRED_PROFILE_FIELDS, REQUIRED_EMPLOYMENT_FIELDS } = require('./driverStatusEngine.service');
const { logEvent } = require('./driverHistory.service');
const { openClearanceForOffboarding } = require('../compliance/driverClearance.service');

const VALID_STATUSES = ['draft', 'pending_kyc', 'pending_verification', 'active', 'on_leave', 'suspended', 'resigned', 'offboarded'];

const OPERATIONS_ALLOWED = {
  active: ['on_leave', 'suspended', 'resigned', 'offboarded'],
  on_leave: ['active', 'resigned'],
  suspended: ['active', 'resigned', 'offboarded'],
  offboarded: ['active', 'resigned'],
};

async function verifyContacts(req, driverId, userId) {
  const Driver = getModel(req, 'Driver');
  const driver = await Driver.findById(driverId);
  if (!driver) {
    const err = new Error('Driver not found');
    err.statusCode = 404;
    throw err;
  }

  if (!['pending_kyc', 'pending_verification'].includes(driver.status)) {
    const err = new Error('Can only verify contacts when driver is in Pending KYC or Pending Verify status');
    err.statusCode = 400;
    throw err;
  }

  driver.contactsVerified = true;
  driver.contactsVerifiedBy = userId;
  driver.contactsVerifiedAt = new Date();
  await driver.save();

  await logEvent(req, driverId, 'contacts_verified', {
    description: 'Contact details verified by Compliance',
  }, userId);

  await evaluateAndTransition(req, driverId, userId);

  // Re-fetch to get the latest status after potential auto-transition
  const updated = await Driver.findById(driverId);
  return updated;
}

async function setClientUserId(req, driverId, clientUserId, userId) {
  const Driver = getModel(req, 'Driver');
  const driver = await Driver.findById(driverId);
  if (!driver) {
    const err = new Error('Driver not found');
    err.statusCode = 404;
    throw err;
  }

  if (driver.status !== 'active') {
    const err = new Error('Cannot set client user ID unless driver is in Active status');
    err.statusCode = 400;
    throw err;
  }

  if (!clientUserId || typeof clientUserId !== 'string' || !clientUserId.trim()) {
    const err = new Error('Client user ID must be a non-empty string');
    err.statusCode = 400;
    throw err;
  }

  const oldClientUserId = driver.clientUserId || null;
  driver.clientUserId = clientUserId.trim();
  await driver.save();

  await logEvent(req, driverId, 'client_user_id_set', {
    fieldName: 'clientUserId',
    oldValue: oldClientUserId,
    newValue: clientUserId.trim(),
    description: oldClientUserId
      ? `Client user ID changed from "${oldClientUserId}" to "${clientUserId.trim()}"`
      : `Client user ID set: ${clientUserId.trim()}`,
    metadata: { clientUserId: clientUserId.trim(), previousClientUserId: oldClientUserId },
  }, userId);

  const updated = await Driver.findById(driverId);
  return updated;
}

async function activateDriver(req, driverId, userId, { personalVerificationConfirmed } = {}) {
  const Driver = getModel(req, 'Driver');
  const User = getModel(req, 'User');
  const driver = await Driver.findById(driverId);
  if (!driver) {
    const err = new Error('Driver not found');
    err.statusCode = 404;
    throw err;
  }

  if (driver.status !== 'pending_verification') {
    const err = new Error('Can only activate a driver that is in Pending Verify status');
    err.statusCode = 400;
    throw err;
  }

  if (!personalVerificationConfirmed) {
    const err = new Error('Personal verification confirmation is mandatory before activating a driver');
    err.statusCode = 400;
    throw err;
  }

  driver.activatedManually = true;
  driver.personalVerificationDone = true;
  driver.personalVerificationBy = userId;
  driver.personalVerificationAt = new Date();
  await driver.save();

  const activatingUser = await User.findById(userId).select('email').lean();
  const activatedByLabel = activatingUser?.email ? `Driver activated by ${activatingUser.email}` : 'Driver activated by authorized user';
  await logEvent(req, driverId, 'personal_verification_confirmed', {
    description: `Personal verification confirmed by ${activatingUser?.email || 'authorized user'}`,
  }, userId);
  await logEvent(req, driverId, 'driver_activated', {
    description: activatedByLabel,
  }, userId);

  await evaluateAndTransition(req, driverId, userId);

  const updated = await Driver.findById(driverId);
  return updated;
}

async function changeStatusManual(req, driverId, newStatus, reason, userId) {
  const Driver = getModel(req, 'Driver');
  const User = getModel(req, 'User');
  const driver = await Driver.findById(driverId);
  if (!driver) {
    const err = new Error('Driver not found');
    err.statusCode = 404;
    throw err;
  }

  const user = await User.findById(userId).populate('roleId');
  if (!user) {
    const err = new Error('Performing user not found');
    err.statusCode = 404;
    throw err;
  }

  if (!VALID_STATUSES.includes(newStatus)) {
    const err = new Error(`Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`);
    err.statusCode = 400;
    throw err;
  }

  if (!reason || typeof reason !== 'string' || !reason.trim()) {
    const err = new Error('Reason is required for manual status changes');
    err.statusCode = 400;
    throw err;
  }

  const currentStatus = driver.status;
  const isAdmin = user.roleId?.isSystemRole === true;
  let description;

  if (isAdmin) {
    description = `Status force-changed by ${user.email || 'admin'}`;
  } else {
    const allowed = OPERATIONS_ALLOWED[currentStatus];
    if (!allowed || !allowed.includes(newStatus)) {
      const err = new Error('This status transition is not permitted');
      err.statusCode = 403;
      throw err;
    }
    description = `Status changed by ${user.email || 'user'}`;
  }

  await applyStatusChange(req, driver, newStatus, reason, description, userId);

  // Auto-open a DriverClearance record when a driver resigns or is offboarded.
  // The clearance must be completed (client + supplier + internal) before
  // their final salary run can be processed.
  if (['resigned', 'offboarded'].includes(newStatus) && !['resigned', 'offboarded'].includes(currentStatus)) {
    try {
      await openClearanceForOffboarding(req, driverId, newStatus, userId);
    } catch (err) {
      // Don't block the status change if clearance creation fails — log and continue.
      // eslint-disable-next-line no-console
      console.error('[driverWorkflow] Failed to open clearance on offboarding:', err.message);
    }
  }

  const updated = await Driver.findById(driverId);
  return updated;
}

async function getDriverStatusSummary(req, driverId) {
  const Driver = getModel(req, 'Driver');
  const DriverDocument = getModel(req, 'DriverDocument');
  const driver = await Driver.findById(driverId);
  if (!driver) {
    const err = new Error('Driver not found');
    err.statusCode = 404;
    throw err;
  }

  const [kycDocsCheck, kycValidCheck, kycDocs] = await Promise.all([
    checkKycDocsUploaded(req, driverId),
    checkKycDocsValid(req, driverId),
    DriverDocument.find({
      driverId,
      docType: { $in: REQUIRED_KYC_DOCS },
      status: { $ne: 'rejected' },
    }).lean(),
  ]);

  // Build a per-document map for the frontend banner
  const documents = {};
  for (const requiredType of REQUIRED_KYC_DOCS) {
    const doc = kycDocs.find(d => d.docType === requiredType);
    if (doc) {
      documents[requiredType] = {
        uploaded: true,
        expiry: doc.expiryDate || null,
        status: doc.status,
      };
    } else {
      documents[requiredType] = {
        uploaded: false,
        expiry: null,
        status: null,
      };
    }
  }

  const profileCheck = checkProfileAndEmploymentComplete(driver);

  const availableAutoTransitions = [];
  if (driver.status === 'draft' && profileCheck.complete) {
    availableAutoTransitions.push('pending_kyc');
  }
  if (driver.status === 'pending_kyc' && kycValidCheck.valid) {
    availableAutoTransitions.push('pending_verification');
  }
  if (driver.status === 'pending_verification' && driver.activatedManually) {
    availableAutoTransitions.push('active');
  }

  return {
    currentStatus: driver.status,
    contactsVerified: driver.contactsVerified || false,
    contactsVerifiedBy: driver.contactsVerifiedBy || null,
    contactsVerifiedAt: driver.contactsVerifiedAt || null,
    clientUserId: driver.clientUserId || null,
    documents,
    kycDocsCheck,
    kycValidCheck,
    profileCheck,
    requiredProfileFields: REQUIRED_PROFILE_FIELDS,
    requiredEmploymentFields: REQUIRED_EMPLOYMENT_FIELDS,
    availableAutoTransitions,
    canVerifyContacts: driver.status === 'pending_kyc' && !driver.contactsVerified,
    canSetClientUserId: driver.status === 'active',
    canActivate: driver.status === 'pending_verification',
    lastStatusChange: driver.lastStatusChange || null,
    isPassportSubmitted: driver.isPassportSubmitted || false,
    passportSubmissionType: driver.passportSubmissionType || null,
    guaranteePassportValid: driver.guaranteePassportValid,
    personalVerificationDone: driver.personalVerificationDone || false,
    personalVerificationBy: driver.personalVerificationBy || null,
    personalVerificationAt: driver.personalVerificationAt || null,
  };
}

module.exports = {
  verifyContacts,
  setClientUserId,
  activateDriver,
  changeStatusManual,
  getDriverStatusSummary,
};
