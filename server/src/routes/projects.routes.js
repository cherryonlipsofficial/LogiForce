const express = require('express');
const router = express.Router();
const { protect, restrictTo } = require('../middleware/auth');
const projectService = require('../services/project.service');
const { Driver } = require('../models');
const { sendSuccess, sendError, sendPaginated } = require('../utils/responseHelper');
const { PAGINATION } = require('../config/constants');

// All routes are protected
router.use(protect);

// ─── Project CRUD ─────────────────────────────────────────────────────────────

// GET /api/projects — paginated list with driverCount and activeContract
router.get('/', async (req, res) => {
  const { clientId, status, search, page, limit } = req.query;
  const result = await projectService.listProjects(
    clientId,
    { status, search },
    { page, limit }
  );
  sendPaginated(res, result.projects, result.total, result.page, result.limit);
});

// POST /api/projects — create (admin, ops)
router.post('/', restrictTo('admin', 'ops'), async (req, res) => {
  const project = await projectService.createProject(req.body, req.user._id);
  sendSuccess(res, project, 'Project created', 201);
});

// GET /api/projects/:id — full project detail (drivers, contracts, stats)
router.get('/:id', async (req, res) => {
  const project = await projectService.getProject(req.params.id);
  sendSuccess(res, project);
});

// PUT /api/projects/:id — update project fields (admin, ops)
router.put('/:id', restrictTo('admin', 'ops'), async (req, res) => {
  const project = await projectService.updateProject(
    req.params.id,
    req.body,
    req.user._id
  );
  sendSuccess(res, project, 'Project updated');
});

// DELETE /api/projects/:id — soft-delete (admin only)
router.delete('/:id', restrictTo('admin'), async (req, res) => {
  const driverCount = await Driver.countDocuments({
    projectId: req.params.id,
  });
  if (driverCount > 0) {
    return sendError(
      res,
      `Cannot delete project with ${driverCount} assigned driver(s). Unassign them first.`,
      400
    );
  }

  const { Project } = require('../models');
  const project = await Project.findById(req.params.id);
  if (!project) return sendError(res, 'Project not found', 404);
  if (project.status === 'active') {
    return sendError(
      res,
      'Cannot delete an active project. Set status to cancelled first.',
      400
    );
  }

  project.status = 'cancelled';
  await project.save();
  sendSuccess(res, project, 'Project cancelled');
});

// ─── Project Contracts ────────────────────────────────────────────────────────

// GET /api/projects/:id/contracts — all contracts for this project
router.get('/:id/contracts', async (req, res) => {
  const { ProjectContract } = require('../models');
  const contracts = await ProjectContract.find({ projectId: req.params.id })
    .sort({ startDate: -1 })
    .lean();
  sendSuccess(res, contracts);
});

// POST /api/projects/:id/contracts — create new contract (admin)
router.post('/:id/contracts', restrictTo('admin'), async (req, res) => {
  const contract = await projectService.createProjectContract(
    req.params.id,
    req.body,
    req.user._id
  );
  sendSuccess(res, contract, 'Project contract created', 201);
});

// POST /api/projects/:id/contracts/renew — renew active contract (admin)
router.post('/:id/contracts/renew', restrictTo('admin'), async (req, res) => {
  const contract = await projectService.renewProjectContract(
    req.params.id,
    req.body,
    req.user._id
  );
  sendSuccess(res, contract, 'Contract renewed', 201);
});

// PUT /api/projects/contracts/:contractId/terminate — terminate (admin)
router.put(
  '/contracts/:contractId/terminate',
  restrictTo('admin'),
  async (req, res) => {
    const contract = await projectService.terminateProjectContract(
      req.params.contractId,
      { reason: req.body.reason, terminationDate: req.body.terminationDate },
      req.user._id
    );
    sendSuccess(res, contract, 'Contract terminated');
  }
);

// ─── Driver Assignment ────────────────────────────────────────────────────────

// POST /api/projects/:id/assign-driver — assign driver (admin, ops)
router.post('/:id/assign-driver', restrictTo('admin', 'ops'), async (req, res) => {
  const { driverId, reason, contractId } = req.body;
  if (!driverId) return sendError(res, 'driverId is required', 400);

  const assignment = await projectService.assignDriverToProject(
    driverId,
    req.params.id,
    { reason, contractId },
    req.user._id
  );
  sendSuccess(res, assignment, 'Driver assigned to project');
});

// POST /api/projects/unassign-driver — unassign driver (admin, ops)
router.post('/unassign-driver', restrictTo('admin', 'ops'), async (req, res) => {
  const { driverId, reason } = req.body;
  if (!driverId) return sendError(res, 'driverId is required', 400);

  const assignment = await projectService.unassignDriverFromProject(
    driverId,
    { reason },
    req.user._id
  );
  sendSuccess(res, assignment, 'Driver unassigned from project');
});

// GET /api/projects/:id/drivers — currently assigned drivers
router.get('/:id/drivers', async (req, res) => {
  const pg = parseInt(req.query.page) || PAGINATION.DEFAULT_PAGE;
  const lim = parseInt(req.query.limit) || PAGINATION.DEFAULT_LIMIT;
  const skip = (pg - 1) * lim;

  const [drivers, total] = await Promise.all([
    Driver.find({ projectId: req.params.id })
      .select('fullName employeeCode status nationality joinDate vehicleType vehiclePlate')
      .populate('clientId', 'name')
      .sort({ fullName: 1 })
      .skip(skip)
      .limit(lim),
    Driver.countDocuments({ projectId: req.params.id }),
  ]);

  sendPaginated(res, drivers, total, pg, lim);
});

// GET /api/projects/:id/driver-history — full assignment history
router.get('/:id/driver-history', async (req, res) => {
  const history = await projectService.getProjectDriverHistory(req.params.id);
  sendSuccess(res, history);
});

module.exports = router;
