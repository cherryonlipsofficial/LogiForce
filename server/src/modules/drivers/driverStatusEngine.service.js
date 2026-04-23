const { getModel } = require('../../config/modelRegistry');
const { logStatusChange } = require('./driverHistory.service');

const REQUIRED_KYC_DOCS = ['emirates_id', 'passport', 'driving_licence'];

/**
 * Fields from the Profile & Employment tabs that must ALL be filled
 * before a driver can move from draft → pending_kyc.
 */
const REQUIRED_PROFILE_FIELDS = ['fullName', 'nationality', 'phoneUae', 'emiratesId'];
const REQUIRED_EMPLOYMENT_FIELDS = ['projectId', 'payStructure', 'baseSalary', 'joinDate'];

/**
 * Check whether all Profile & Employment tab fields are filled.
 * Returns { complete: boolean, missing: string[] }
 */
function checkProfileAndEmploymentComplete(driver) {
  const allFields = [...REQUIRED_PROFILE_FIELDS, ...REQUIRED_EMPLOYMENT_FIELDS];
  const missing = [];

  for (const field of allFields) {
    const value = driver[field];
    if (value === undefined || value === null || value === '') {
      missing.push(field);
    }
  }

  return { complete: missing.length === 0, missing };
}

/**
 * Check whether all 3 required KYC documents are uploaded.
 * Does NOT check expiry here — just presence.
 * Returns { ready: boolean, missing: string[] }
 */
async function checkKycDocsUploaded(req, driverId) {
  const DriverDocument = getModel(req, 'DriverDocument');
  const docs = await DriverDocument.find({
    driverId,
    docType: { $in: REQUIRED_KYC_DOCS },
    // any status except 'rejected' counts as uploaded
    status: { $ne: 'rejected' },
  }).lean();

  const uploaded = docs.map(d => d.docType);
  const missing  = REQUIRED_KYC_DOCS.filter(t => !uploaded.includes(t));
  return { ready: missing.length === 0, missing };
}

/**
 * Check whether all 3 required KYC documents are valid (not expired).
 * Returns { valid: boolean, issues: [{ docType, issue }] }
 */
async function checkKycDocsValid(req, driverId) {
  const DriverDocument = getModel(req, 'DriverDocument');
  const docs = await DriverDocument.find({
    driverId,
    docType: { $in: REQUIRED_KYC_DOCS },
    status: { $ne: 'rejected' },
  }).lean();

  const today  = new Date();
  today.setHours(0, 0, 0, 0);
  const issues = [];

  for (const requiredType of REQUIRED_KYC_DOCS) {
    const doc = docs.find(d => d.docType === requiredType);
    if (!doc) {
      issues.push({ docType: requiredType, issue: 'not_uploaded' });
      continue;
    }
    if (!doc.expiryDate) {
      // No expiry date recorded — flag as warning but do NOT block KYC validity.
      // Only actually-expired documents should block the transition.
      continue;
    }
    const expiry = new Date(doc.expiryDate);
    expiry.setHours(0, 0, 0, 0);
    if (expiry <= today) {
      issues.push({ docType: requiredType, issue: 'expired', expiryDate: doc.expiryDate });
    }
  }

  return { valid: issues.length === 0, issues };
}

/**
 * Core engine — called after any document upload, document update,
 * contacts verification, or clientUserId update.
 *
 * Computes the highest status the driver qualifies for automatically
 * and transitions them if their current status is lower.
 *
 * Auto transitions only move FORWARD in the workflow.
 * They never override manual statuses like on_leave, suspended, etc.
 */
async function evaluateAndTransition(req, driverId, triggeredBy) {
  const Driver = getModel(req, 'Driver');
  const User = getModel(req, 'User');
  const driver = await Driver.findById(driverId);
  if (!driver) throw new Error('Driver not found');

  const currentStatus = driver.status;

  // Only auto-transitions apply to drivers in early-stage statuses.
  // If driver is active, on_leave, suspended, resigned, or offboarded
  // the engine does NOT override those statuses.
  const autoEligible = ['draft', 'pending_kyc', 'pending_verification'];
  if (!autoEligible.includes(currentStatus)) {
    return { transitioned: false, reason: 'Manual status — engine skipped' };
  }

  // ── Evaluate target status ──

  // Level 1: draft → pending_kyc
  // Condition: all Profile & Employment tab fields are filled
  const profileCheck = checkProfileAndEmploymentComplete(driver);
  if (!profileCheck.complete) {
    // Cannot move past draft
    return { transitioned: false, currentStatus, reason: 'Incomplete profile/employment fields: ' + profileCheck.missing.join(', ') };
  }

  // Level 2: pending_kyc → pending_verification
  // Condition: all 3 required KYC docs are valid (uploaded and not expired)
  const kycValid = await checkKycDocsValid(req, driverId);

  if (kycValid.valid) {
    // Driver qualifies for pending_verification — all docs uploaded and valid
    if (currentStatus === 'draft' || currentStatus === 'pending_kyc') {
      await applyStatusChange(req, driver, 'pending_verification', null,
        'All KYC documents uploaded and valid', triggeredBy);
      return { transitioned: true, newStatus: 'pending_verification' };
    }
  } else if (profileCheck.complete) {
    // Profile complete but docs not valid
    // → pending_kyc is the right status, but passport submission is mandatory first

    // Passport submission is mandatory before pending_kyc
    if (!driver.isPassportSubmitted) {
      return {
        ready: false,
        reason: 'Passport not yet submitted',
        missingCheck: 'passport_submission',
      };
    }

    // If passport is guarantee type, check it is still valid
    if (driver.passportSubmissionType === 'guarantee') {
      if (!driver.guaranteePassportValid) {
        return {
          ready: false,
          reason: 'Guarantee passport has expired or is not valid',
          missingCheck: 'guarantee_passport_expired',
        };
      }
    }

    if (currentStatus === 'draft') {
      await applyStatusChange(req, driver, 'pending_kyc', null,
        'Profile and employment details completed', triggeredBy);
      return { transitioned: true, newStatus: 'pending_kyc' };
    }
  }

  // Level 3: pending_verification → active
  // Condition: activated manually by compliance via 'drivers.activate' permission only
  // clientUserId no longer triggers activation — it's set by Operations after driver is active
  if (currentStatus === 'pending_verification' && driver.activatedManually) {
    const activatingUser = await User.findById(typeof triggeredBy === 'object' ? triggeredBy._id : triggeredBy).select('email').lean();
    const activatedByLabel = activatingUser?.email ? `Activated by ${activatingUser.email}` : 'Activated by authorized user';
    await applyStatusChange(req, driver, 'active', null,
      activatedByLabel, triggeredBy);
    return { transitioned: true, newStatus: 'active' };
  }

  return { transitioned: false, currentStatus };
}

/**
 * Internal helper — applies the status change and logs it.
 */
async function applyStatusChange(req, driver, newStatus, reason, description, performedBy) {
  const oldStatus = driver.status;
  driver.status = newStatus;
  driver.lastStatusChange = {
    from:      oldStatus,
    to:        newStatus,
    reason:    reason || description,
    changedBy: typeof performedBy === 'object' ? performedBy._id : performedBy,
    changedAt: new Date(),
  };
  await driver.save();
  await logStatusChange(req, driver._id, oldStatus, newStatus, reason, description, performedBy);
}

module.exports = {
  checkProfileAndEmploymentComplete,
  checkKycDocsUploaded,
  checkKycDocsValid,
  evaluateAndTransition,
  applyStatusChange,
  REQUIRED_KYC_DOCS,
  REQUIRED_PROFILE_FIELDS,
  REQUIRED_EMPLOYMENT_FIELDS,
};
