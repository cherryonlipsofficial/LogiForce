const express = require('express');
const router = express.Router();
const { protect, requirePermission } = require('../../middleware/auth');
const { sendSuccess, sendError } = require('../../utils/responseHelper');
const { getModel } = require('../../config/modelRegistry');
const guaranteePassportService = require('./guaranteePassport.service');

router.use(protect);

// ── Driver passport routes (/api/drivers/:driverId/passport/...) ──

// Mark own passport submitted
router.post(
  '/drivers/:driverId/passport/own',
  requirePermission('drivers.manage_passport'),
  async (req, res) => {
    const driver = await guaranteePassportService.submitOwnPassport(
      req,
      req.params.driverId,
      req.user._id
    );
    sendSuccess(res, driver, 'Own passport submission recorded');
  }
);

// Record a guarantee passport
router.post(
  '/drivers/:driverId/passport/guarantee',
  requirePermission('drivers.manage_passport'),
  async (req, res) => {
    const { guarantorName, guarantorRelation, relation, guarantorPassportNumber } = req.body;

    if (!guarantorName || (!guarantorRelation && !relation) || !guarantorPassportNumber) {
      return sendError(res, 'guarantorName, guarantorRelation, and guarantorPassportNumber are required.', 400);
    }

    // Normalize: accept "relation" as alias for "guarantorRelation"
    if (!req.body.guarantorRelation && req.body.relation) {
      req.body.guarantorRelation = req.body.relation;
    }

    const result = await guaranteePassportService.recordGuaranteePassport(
      req,
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
    const GuaranteePassport = getModel(req, 'GuaranteePassport');
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
    const history = await guaranteePassportService.getGuaranteeHistory(req, req.params.driverId);
    sendSuccess(res, history);
  }
);

// ── Guarantee passport management routes (/api/guarantee-passports/...) ──

// List all guarantee passports (for compliance dashboard)
router.get(
  '/guarantee-passports',
  requirePermission('guarantee_passports.view'),
  async (req, res) => {
    const GuaranteePassport = getModel(req, 'GuaranteePassport');
    const records = await GuaranteePassport.find()
      .populate('driverId', 'fullName employeeCode')
      .sort({ createdAt: -1 })
      .lean();

    // Compute real-time status: if DB says active/extended but expiry has passed, mark as expired
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (const record of records) {
      if (
        ['active', 'extended'].includes(record.status) &&
        record.expiryDate &&
        new Date(record.expiryDate) < today
      ) {
        record.status = 'expired';
      }
    }

    sendSuccess(res, records);
  }
);

// Get all pending extension requests (admin only)
router.get(
  '/guarantee-passports/pending-extensions',
  requirePermission('roles.manage'),
  async (req, res) => {
    const GuaranteePassport = getModel(req, 'GuaranteePassport');
    const pending = await GuaranteePassport.find({ 'extensionRequest.status': 'pending' })
      .populate('driverId', 'fullName employeeCode clientId projectId')
      .populate('extensionRequest.requestedBy', 'name')
      .sort({ 'extensionRequest.requestedAt': -1 })
      .lean({ virtuals: true });

    sendSuccess(res, pending);
  }
);

// Get guarantees expiring soon (admin + compliance)
router.get(
  '/guarantee-passports/expiring',
  requirePermission('drivers.view'),
  async (req, res) => {
    const GuaranteePassport = getModel(req, 'GuaranteePassport');
    const days = parseInt(req.query.days) || 7;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + days);

    const includeExpired = req.query.includeExpired === 'true';
    const filter = includeExpired
      ? {
          $or: [
            { status: { $in: ['active', 'extended'] }, expiryDate: { $lte: cutoff } },
            { status: 'expired' },
          ],
        }
      : {
          status: { $in: ['active', 'extended'] },
          expiryDate: { $lte: cutoff, $gte: new Date() },
        };

    const expiring = await GuaranteePassport.find(filter)
      .populate('driverId', 'fullName employeeCode')
      .sort({ expiryDate: 1 })
      .lean({ virtuals: true });

    sendSuccess(res, expiring);
  }
);

// Run expiry check (admin only) — must be before :id routes
router.post(
  '/guarantee-passports/run-expiry-check',
  requirePermission('roles.manage'),
  async (req, res) => {
    const result = await guaranteePassportService.runExpiryCheck(req);
    sendSuccess(res, result, 'Expiry check completed');
  }
);

// Request extension
router.post(
  '/guarantee-passports/:id/request-extension',
  requirePermission('drivers.manage_passport'),
  async (req, res) => {
    const { requestedDays, reason } = req.body;

    if (!requestedDays || requestedDays < 1 || requestedDays > 30) {
      return sendError(res, 'requestedDays must be between 1 and 30.', 400);
    }
    if (!reason || !reason.trim()) {
      return sendError(res, 'reason is required.', 400);
    }

    const guarantee = await guaranteePassportService.requestExtension(
      req,
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
      req,
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
  requirePermission('drivers.manage_passport'),
  async (req, res) => {
    const result = await guaranteePassportService.returnGuarantee(
      req,
      req.params.id,
      req.body.notes,
      req.user._id
    );
    sendSuccess(res, result, 'Guarantee passport returned');
  }
);

module.exports = router;
