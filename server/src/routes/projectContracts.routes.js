const express = require('express');
const router = express.Router();
const { protect, restrictTo } = require('../middleware/auth');
const { ProjectContract, Project } = require('../models');
const { sendSuccess, sendError, sendPaginated } = require('../utils/responseHelper');
const { PAGINATION } = require('../config/constants');

// All routes are protected
router.use(protect);

// GET /api/project-contracts — list contracts (optionally filtered by projectId or clientId)
router.get('/', async (req, res) => {
  const { projectId, clientId, status, page, limit } = req.query;
  const query = {};
  if (projectId) query.projectId = projectId;
  if (clientId) query.clientId = clientId;
  if (status) query.status = status;

  const pg = parseInt(page) || PAGINATION.DEFAULT_PAGE;
  const lim = parseInt(limit) || PAGINATION.DEFAULT_LIMIT;
  const skip = (pg - 1) * lim;

  const [contracts, total] = await Promise.all([
    ProjectContract.find(query)
      .populate('projectId', 'name projectCode')
      .populate('clientId', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(lim),
    ProjectContract.countDocuments(query),
  ]);

  sendPaginated(res, contracts, total, pg, lim);
});

// POST /api/project-contracts — create (admin, accountant)
router.post('/', restrictTo('admin', 'accountant'), async (req, res) => {
  // Auto-fill clientId from the project if not provided
  if (!req.body.clientId && req.body.projectId) {
    const project = await Project.findById(req.body.projectId).select('clientId');
    if (project) req.body.clientId = project.clientId;
  }

  const contract = await ProjectContract.create({
    ...req.body,
    createdBy: req.user._id,
  });
  sendSuccess(res, contract, 'Project contract created', 201);
});

// GET /api/project-contracts/:id
router.get('/:id', async (req, res) => {
  const contract = await ProjectContract.findById(req.params.id)
    .populate('projectId', 'name projectCode')
    .populate('clientId', 'name');
  if (!contract) return sendError(res, 'Project contract not found', 404);
  sendSuccess(res, contract);
});

// PUT /api/project-contracts/:id — update (admin, accountant)
router.put('/:id', restrictTo('admin', 'accountant'), async (req, res) => {
  const contract = await ProjectContract.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });
  if (!contract) return sendError(res, 'Project contract not found', 404);
  sendSuccess(res, contract, 'Project contract updated');
});

// DELETE /api/project-contracts/:id — delete draft only (admin)
router.delete('/:id', restrictTo('admin'), async (req, res) => {
  const contract = await ProjectContract.findById(req.params.id);
  if (!contract) return sendError(res, 'Project contract not found', 404);
  if (contract.status !== 'draft') {
    return sendError(res, 'Only draft contracts can be deleted', 400);
  }
  await contract.deleteOne();
  sendSuccess(res, null, 'Project contract deleted');
});

// POST /api/project-contracts/:id/activate — activate a draft contract (admin, accountant)
router.post('/:id/activate', restrictTo('admin', 'accountant'), async (req, res) => {
  const contract = await ProjectContract.findById(req.params.id);
  if (!contract) return sendError(res, 'Project contract not found', 404);
  if (contract.status !== 'draft') {
    return sendError(res, 'Only draft contracts can be activated', 400);
  }

  // Expire any other active contract for the same project
  await ProjectContract.updateMany(
    { projectId: contract.projectId, status: 'active', _id: { $ne: contract._id } },
    { status: 'expired' }
  );

  contract.status = 'active';
  await contract.save();
  sendSuccess(res, contract, 'Contract activated');
});

// POST /api/project-contracts/:id/terminate — terminate an active contract
router.post('/:id/terminate', restrictTo('admin', 'accountant'), async (req, res) => {
  const contract = await ProjectContract.findById(req.params.id);
  if (!contract) return sendError(res, 'Project contract not found', 404);
  if (contract.status !== 'active') {
    return sendError(res, 'Only active contracts can be terminated', 400);
  }

  contract.status = 'terminated';
  contract.terminationDate = new Date();
  contract.terminationReason = req.body.reason || '';
  await contract.save();
  sendSuccess(res, contract, 'Contract terminated');
});

module.exports = router;
