const express = require('express');
const router = express.Router();
const { protect, restrictTo } = require('../middleware/auth');
const { Project, Driver, DriverProjectAssignment } = require('../models');
const { sendSuccess, sendError, sendPaginated } = require('../utils/responseHelper');
const { PAGINATION } = require('../config/constants');

// All routes are protected
router.use(protect);

// GET /api/projects — list all projects (with optional clientId filter)
router.get('/', async (req, res) => {
  const { clientId, status, search, page, limit } = req.query;
  const query = {};
  if (clientId) query.clientId = clientId;
  if (status) query.status = status;
  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { projectCode: { $regex: search, $options: 'i' } },
      { location: { $regex: search, $options: 'i' } },
    ];
  }

  const pg = parseInt(page) || PAGINATION.DEFAULT_PAGE;
  const lim = parseInt(limit) || PAGINATION.DEFAULT_LIMIT;
  const skip = (pg - 1) * lim;

  const [projects, total] = await Promise.all([
    Project.find(query)
      .populate('clientId', 'name')
      .populate('driverCount')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(lim),
    Project.countDocuments(query),
  ]);

  sendPaginated(res, projects, total, pg, lim);
});

// POST /api/projects — create (admin, accountant, ops)
router.post('/', restrictTo('admin', 'accountant', 'ops'), async (req, res) => {
  const project = await Project.create({
    ...req.body,
    createdBy: req.user._id,
  });
  sendSuccess(res, project, 'Project created', 201);
});

// GET /api/projects/:id — get single project with driver count
router.get('/:id', async (req, res) => {
  const project = await Project.findById(req.params.id)
    .populate('clientId', 'name')
    .populate('driverCount');
  if (!project) return sendError(res, 'Project not found', 404);

  const activeDriverCount = await Driver.countDocuments({
    projectId: req.params.id,
    status: { $in: ['active', 'on_leave'] },
  });

  const result = project.toObject();
  result.activeDriverCount = activeDriverCount;
  sendSuccess(res, result);
});

// PUT /api/projects/:id — update (admin, accountant, ops)
router.put('/:id', restrictTo('admin', 'accountant', 'ops'), async (req, res) => {
  const project = await Project.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });
  if (!project) return sendError(res, 'Project not found', 404);
  sendSuccess(res, project, 'Project updated');
});

// DELETE /api/projects/:id — delete (admin only, only if no drivers assigned)
router.delete('/:id', restrictTo('admin'), async (req, res) => {
  const driverCount = await Driver.countDocuments({ projectId: req.params.id });
  if (driverCount > 0) {
    return sendError(res, `Cannot delete project with ${driverCount} assigned driver(s). Unassign them first.`, 400);
  }
  const project = await Project.findByIdAndDelete(req.params.id);
  if (!project) return sendError(res, 'Project not found', 404);
  sendSuccess(res, null, 'Project deleted');
});

// GET /api/projects/:id/drivers — list drivers assigned to this project
router.get('/:id/drivers', async (req, res) => {
  const pg = parseInt(req.query.page) || PAGINATION.DEFAULT_PAGE;
  const lim = parseInt(req.query.limit) || PAGINATION.DEFAULT_LIMIT;
  const skip = (pg - 1) * lim;

  const [drivers, total] = await Promise.all([
    Driver.find({ projectId: req.params.id })
      .populate('clientId', 'name')
      .sort({ fullName: 1 })
      .skip(skip)
      .limit(lim),
    Driver.countDocuments({ projectId: req.params.id }),
  ]);

  sendPaginated(res, drivers, total, pg, lim);
});

// POST /api/projects/:id/assign — assign a driver to this project
router.post('/:id/assign', restrictTo('admin', 'ops'), async (req, res) => {
  const { driverId } = req.body;
  if (!driverId) return sendError(res, 'driverId is required', 400);

  const project = await Project.findById(req.params.id);
  if (!project) return sendError(res, 'Project not found', 404);

  const driver = await Driver.findById(driverId);
  if (!driver) return sendError(res, 'Driver not found', 404);

  // Ensure driver belongs to the same client
  if (driver.clientId.toString() !== project.clientId.toString()) {
    return sendError(res, 'Driver belongs to a different client than this project', 400);
  }

  // Close any existing active assignment for this driver
  if (driver.currentProjectAssignmentId) {
    await DriverProjectAssignment.findByIdAndUpdate(driver.currentProjectAssignmentId, {
      status: 'completed',
      unassignedDate: new Date(),
      reason: 'Reassigned to another project',
      closedBy: req.user._id,
    });
  }

  // Create new assignment record
  const assignment = await DriverProjectAssignment.create({
    driverId,
    projectId: project._id,
    clientId: project.clientId,
    ratePerDriver: project.ratePerDriver,
    assignedDate: new Date(),
    assignedBy: req.user._id,
  });

  // Update driver's current project reference
  driver.projectId = project._id;
  driver.currentProjectAssignmentId = assignment._id;
  await driver.save();

  sendSuccess(res, { driver, assignment }, 'Driver assigned to project', 200);
});

// POST /api/projects/:id/unassign — unassign a driver from this project
router.post('/:id/unassign', restrictTo('admin', 'ops'), async (req, res) => {
  const { driverId, reason } = req.body;
  if (!driverId) return sendError(res, 'driverId is required', 400);

  const driver = await Driver.findById(driverId);
  if (!driver) return sendError(res, 'Driver not found', 404);

  if (!driver.projectId || driver.projectId.toString() !== req.params.id) {
    return sendError(res, 'Driver is not assigned to this project', 400);
  }

  // Close the active assignment
  if (driver.currentProjectAssignmentId) {
    await DriverProjectAssignment.findByIdAndUpdate(driver.currentProjectAssignmentId, {
      status: 'completed',
      unassignedDate: new Date(),
      reason: reason || 'Unassigned from project',
      closedBy: req.user._id,
    });
  }

  // Clear driver's project reference
  driver.projectId = null;
  driver.currentProjectAssignmentId = null;
  await driver.save();

  sendSuccess(res, driver, 'Driver unassigned from project');
});

// GET /api/projects/:id/assignments — assignment history for a project
router.get('/:id/assignments', async (req, res) => {
  const pg = parseInt(req.query.page) || PAGINATION.DEFAULT_PAGE;
  const lim = parseInt(req.query.limit) || PAGINATION.DEFAULT_LIMIT;
  const skip = (pg - 1) * lim;

  const [assignments, total] = await Promise.all([
    DriverProjectAssignment.find({ projectId: req.params.id })
      .populate('driverId', 'fullName employeeCode')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(lim),
    DriverProjectAssignment.countDocuments({ projectId: req.params.id }),
  ]);

  sendPaginated(res, assignments, total, pg, lim);
});

module.exports = router;
