const express = require('express');
const router = express.Router();
const { protect, requirePermission } = require('../middleware/auth');
const { sendSuccess, sendError } = require('../utils/responseHelper');
const { GuaranteePassport } = require('../models');
const guaranteePassportService = require('../services/guaranteePassport.service');

router.use(protect);

// ── Driver passport routes (/api/drivers/:driverId/passport/...) ──

// Mark own passport submitted
router.post(
  '/drivers/:driverId/passport/own',
  requirePermission('drivers.edit'),
  async (req, res) => {
    const driver = await guaranteePassportService.submitOwnPassport(
      req.params.driverId,
      req.user._id
    );
    sendSuccess(res, driver, 'Own passport submission recorded');
  }
);

// Record a guarantee passport
router.post(
  '/drivers/:driverId/passport/guarantee',
  requirePermission('drivers.edit'),
  async (req, res) => {
    const { guarantorName, guarantorRelation, guarantorPassportNumber } = req.body;

    if (!guarantorName || !guarantorRelation || !guarantorPassportNumber) {
      return sendError(res, 'guarantorName, guarantorRelation, and guarantorPassportNumber are required.', 400);
    }

    const result = await guaranteePassportService.recordGuaranteePassport(
      req.params.driverId,
      req.body,
      req.user._id
    );
    sendSuccess(res, result, 'Guarantee passport recorded', 201);
  }
);

// Get current active guarantee for a driver
router.get(
  '/drivers/:driverId/passport/guarantee',
  requirePermission('drivers.view'),
  async (req, res) => {
    const guarantee = await GuaranteePassport.findOne({
      driverId: req.params.driverId,
      status: { $in: ['active', 'extended'] },
    })
      .populate('submittedBy', 'name')
      .populate('extensionRequest.requestedBy', 'name')
      .populate('extensionRequest.reviewedBy', 'name')
      .lean();

    sendSuccess(res, guarantee);
  }
);

// Get all guarantee history for a driver
router.get(
  '/drivers/:driverId/passport/guarantee/history',
  requirePermission('drivers.view'),
  async (req, res) => {
    const history = await guaranteePassportService.getGuaranteeHistory(req.params.driverId);
    sendSuccess(res, history);
  }
);

// ── Guarantee passport management routes (/api/guarantee-passports/...) ──

// List all guarantee passports (for compliance dashboard)
router.get(
  '/guarantee-passports',
  requirePermission('drivers.view'),
  async (req, res) => {
    const records = await GuaranteePassport.find()
      .populate('driverId', 'fullName employeeCode')
      .sort({ createdAt: -1 })
      .lean();
    sendSuccess(res, records);
  }
);

// Run expiry check (admin only) — must be before :id routes
router.post(
  '/guarantee-passports/run-expiry-check',
  requirePermission('roles.manage'),
  async (req, res) => {
    const result = await guaranteePassportService.runExpiryCheck();
    sendSuccess(res, result, 'Expiry check completed');
  }
);

// Request extension
router.post(
  '/guarantee-passports/:id/request-extension',
  requirePermission('drivers.edit'),
  async (req, res) => {
    const { requestedDays, reason } = req.body;

    if (!requestedDays || requestedDays < 1 || requestedDays > 30) {
      return sendError(res, 'requestedDays must be between 1 and 30.', 400);
    }
    if (!reason || !reason.trim()) {
      return sendError(res, 'reason is required.', 400);
    }

    const guarantee = await guaranteePassportService.requestExtension(
      req.params.id,
      req.body,
      req.user._id
    );
    sendSuccess(res, guarantee, 'Extension request submitted');
  }
);

// Review extension (admin only)
router.put(
  '/guarantee-passports/:id/review-extension',
  requirePermission('roles.manage'),
  async (req, res) => {
    const { decision, reviewNotes } = req.body;

    if (!['approved', 'rejected'].includes(decision)) {
      return sendError(res, "decision must be 'approved' or 'rejected'.", 400);
    }
    if (decision === 'rejected' && (!reviewNotes || !reviewNotes.trim())) {
      return sendError(res, 'reviewNotes is required when rejecting.', 400);
    }

    const guarantee = await guaranteePassportService.reviewExtension(
      req.params.id,
      decision,
      reviewNotes,
      req.user._id
    );
    sendSuccess(res, guarantee, `Extension ${decision}`);
  }
);

// Return guarantee passport
router.post(
  '/guarantee-passports/:id/return',
  requirePermission('drivers.edit'),
  async (req, res) => {
    const result = await guaranteePassportService.returnGuarantee(
      req.params.id,
      req.body.notes,
      req.user._id
    );
    sendSuccess(res, result, 'Guarantee passport returned');
  }
);

module.exports = router;
