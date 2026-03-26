const { Driver, DriverDocument } = require('../models');
const { logStatusChange } = require('./driverHistory.service');

const REQUIRED_KYC_DOCS = ['emirates_id', 'passport', 'driving_licence'];

/**
 * Check whether all 3 required KYC documents are uploaded.
 * Does NOT check expiry here — just presence.
 * Returns { ready: boolean, missing: string[] }
 */
async function checkKycDocsUploaded(driverId) {
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
async function checkKycDocsValid(driverId) {
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
async function evaluateAndTransition(driverId, triggeredBy) {
  const driver = await Driver.findById(driverId);
  if (!driver) throw new Error('Driver not found');

  const currentStatus = driver.status;

  // Only auto-transitions apply to drivers in early-stage statuses.
  // If driver is active, on_leave, suspended, resigned, or offboarding
  // the engine does NOT override those statuses.
  const autoEligible = ['draft', 'pending_kyc', 'pending_verification'];
  if (!autoEligible.includes(currentStatus)) {
    return { transitioned: false, reason: 'Manual status — engine skipped' };
  }

  // ── Evaluate target status ──

  // Level 1: draft → pending_kyc
  // Condition: all 3 required docs are uploaded
  const kycUploaded = await checkKycDocsUploaded(driverId);
  if (!kycUploaded.ready) {
    // Cannot move past draft
    return { transitioned: false, currentStatus, reason: 'Missing docs: ' + kycUploaded.missing.join(', ') };
  }

  // Level 2: pending_kyc → pending_verification
  // Condition: all 3 docs are valid (not expired) AND contacts are verified
  const kycValid = await checkKycDocsValid(driverId);
  const contactsOk = driver.contactsVerified === true;

  if (kycValid.valid && contactsOk) {
    // Driver qualifies for pending_verification
    if (currentStatus === 'draft' || currentStatus === 'pending_kyc') {
      await applyStatusChange(driver, 'pending_verification', null,
        'All KYC documents valid and contacts verified', triggeredBy);
      return { transitioned: true, newStatus: 'pending_verification' };
    }
  } else if (kycUploaded.ready) {
    // Docs uploaded but not all valid OR contacts not verified
    // → pending_kyc is the right status
    if (currentStatus === 'draft') {
      await applyStatusChange(driver, 'pending_kyc', null,
        'Required documents uploaded', triggeredBy);
      return { transitioned: true, newStatus: 'pending_kyc' };
    }
  }

  // Level 3: pending_verification → active
  // Condition: clientUserId is set
  if (currentStatus === 'pending_verification' && driver.clientUserId) {
    await applyStatusChange(driver, 'active', null,
      'Client user ID assigned by operations', triggeredBy);
    return { transitioned: true, newStatus: 'active' };
  }

  return { transitioned: false, currentStatus };
}

/**
 * Internal helper — applies the status change and logs it.
 */
async function applyStatusChange(driver, newStatus, reason, description, performedBy) {
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
  await logStatusChange(driver._id, oldStatus, newStatus, reason || description, performedBy);
}

module.exports = {
  checkKycDocsUploaded,
  checkKycDocsValid,
  evaluateAndTransition,
  applyStatusChange,
  REQUIRED_KYC_DOCS,
};
