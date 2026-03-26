const { Driver, User, DriverDocument } = require('../models');
const { applyStatusChange, evaluateAndTransition, checkKycDocsUploaded, checkKycDocsValid, checkProfileAndEmploymentComplete, REQUIRED_KYC_DOCS, REQUIRED_PROFILE_FIELDS, REQUIRED_EMPLOYMENT_FIELDS } = require('./driverStatusEngine.service');
const { logEvent } = require('./driverHistory.service');

const VALID_STATUSES = ['draft', 'pending_kyc', 'pending_verification', 'active', 'on_leave', 'suspended', 'resigned', 'offboarding'];

const OPERATIONS_ALLOWED = {
  active: ['on_leave', 'suspended', 'resigned', 'offboarding'],
  on_leave: ['active', 'resigned'],
  suspended: ['active', 'resigned', 'offboarding'],
  offboarding: ['resigned'],
};

async function verifyContacts(driverId, userId) {
  const driver = await Driver.findById(driverId);
  if (!driver) {
    const err = new Error('Driver not found');
    err.statusCode = 404;
    throw err;
  }

  if (driver.status !== 'pending_kyc') {
    const err = new Error('Can only verify contacts when driver is in pending_kyc status');
    err.statusCode = 400;
    throw err;
  }

  driver.contactsVerified = true;
  driver.contactsVerifiedBy = userId;
  driver.contactsVerifiedAt = new Date();
  await driver.save();

  await logEvent(driverId, 'contacts_verified', {
    description: 'Contact details verified by Compliance',
  }, userId);

  await evaluateAndTransition(driverId, userId);

  // Re-fetch to get the latest status after potential auto-transition
  const updated = await Driver.findById(driverId);
  return updated;
}

async function setClientUserId(driverId, clientUserId, userId) {
  const driver = await Driver.findById(driverId);
  if (!driver) {
    const err = new Error('Driver not found');
    err.statusCode = 404;
    throw err;
  }

  if (driver.status !== 'pending_verification') {
    const err = new Error('Cannot set client user ID unless driver is in pending_verification status');
    err.statusCode = 400;
    throw err;
  }

  if (!clientUserId || typeof clientUserId !== 'string' || !clientUserId.trim()) {
    const err = new Error('Client user ID must be a non-empty string');
    err.statusCode = 400;
    throw err;
  }

  driver.clientUserId = clientUserId.trim();
  await driver.save();

  await logEvent(driverId, 'client_user_id_set', {
    description: `Client user ID set: ${clientUserId}`,
    metadata: { clientUserId },
  }, userId);

  await evaluateAndTransition(driverId, userId);

  const updated = await Driver.findById(driverId);
  return updated;
}

async function changeStatusManual(driverId, newStatus, reason, userId) {
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
  const isAdmin = user.roleId && user.roleId.isSystemRole && user.roleId.name === 'admin';
  let description;

  if (isAdmin) {
    description = `Status force-changed by admin: "${currentStatus}" → "${newStatus}". Reason: ${reason}`;
  } else {
    const allowed = OPERATIONS_ALLOWED[currentStatus];
    if (!allowed || !allowed.includes(newStatus)) {
      const err = new Error('This status transition is not permitted');
      err.statusCode = 403;
      throw err;
    }
    description = `Status changed: "${currentStatus}" → "${newStatus}". Reason: ${reason}`;
  }

  await applyStatusChange(driver, newStatus, reason, description, userId);
  const updated = await Driver.findById(driverId);
  return updated;
}

async function getDriverStatusSummary(driverId) {
  const driver = await Driver.findById(driverId);
  if (!driver) {
    const err = new Error('Driver not found');
    err.statusCode = 404;
    throw err;
  }

  const [kycDocsCheck, kycValidCheck, kycDocs] = await Promise.all([
    checkKycDocsUploaded(driverId),
    checkKycDocsValid(driverId),
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
  if (driver.status === 'pending_kyc' && driver.contactsVerified && kycValidCheck.valid) {
    availableAutoTransitions.push('pending_verification');
  }
  if (driver.status === 'pending_verification' && driver.clientUserId) {
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
    canSetClientUserId: driver.status === 'pending_verification' && !driver.clientUserId,
    lastStatusChange: driver.lastStatusChange || null,
  };
}

module.exports = {
  verifyContacts,
  setClientUserId,
  changeStatusManual,
  getDriverStatusSummary,
};
