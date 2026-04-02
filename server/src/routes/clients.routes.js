const express = require('express');
const router = express.Router();
const multer = require('multer');
const { protect, requirePermission } = require('../middleware/auth');
const { getModel } = require('../config/modelRegistry');
const { sendSuccess, sendError, sendPaginated } = require('../utils/responseHelper');
const { PAGINATION } = require('../config/constants');
const validate = require('../middleware/validate');
const { createClientValidation, updateClientValidation } = require('../middleware/validators/client.validators');

// Memory storage for MongoDB — no disk writes
const memUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Only PDF files are allowed'));
  },
});

// All routes are protected
router.use(protect);

// GET /api/clients — list clients with pagination (exclude binary data)
router.get('/', async (req, res) => {
  const Client = getModel(req, 'Client');
  const page = parseInt(req.query.page) || PAGINATION.DEFAULT_PAGE;
  const limit = parseInt(req.query.limit) || PAGINATION.DEFAULT_LIMIT;
  const skip = (page - 1) * limit;

  const query = {};
  if (req.query.search) {
    query.$or = [
      { name: { $regex: req.query.search, $options: 'i' } },
      { contactName: { $regex: req.query.search, $options: 'i' } },
    ];
  }

  const [clients, total] = await Promise.all([
    Client.find(query).select('-contractFile.data').sort({ name: 1 }).skip(skip).limit(limit).lean(),
    Client.countDocuments(query),
  ]);

  sendPaginated(res, clients, total, page, limit);
});

// POST /api/clients — create (admin, accountant)
router.post('/', requirePermission('clients.create'), validate(createClientValidation), async (req, res) => {
  const Client = getModel(req, 'Client');
  const client = await Client.create(req.body);
  sendSuccess(res, client, 'Client created', 201);
});

// GET /api/clients/:id — get with driver count (exclude binary data)
router.get('/:id', async (req, res) => {
  const Client = getModel(req, 'Client');
  const Driver = getModel(req, 'Driver');
  const client = await Client.findById(req.params.id).select('-contractFile.data').lean();
  if (!client) return sendError(res, 'Client not found', 404);

  const driverCount = await Driver.countDocuments({ clientId: req.params.id });
  const result = { ...client };
  result.driverCount = driverCount;

  sendSuccess(res, result);
});

// PUT /api/clients/:id — update (admin, accountant)
router.put('/:id', requirePermission('clients.edit'), validate(updateClientValidation), async (req, res) => {
  const Client = getModel(req, 'Client');
  const client = await Client.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
    projection: '-contractFile.data',
  });
  if (!client) return sendError(res, 'Client not found', 404);
  sendSuccess(res, client, 'Client updated');
});

// DELETE /api/clients/:id — delete (admin)
router.delete('/:id', requirePermission('clients.delete'), async (req, res) => {
  const Client = getModel(req, 'Client');
  const client = await Client.findByIdAndDelete(req.params.id);
  if (!client) return sendError(res, 'Client not found', 404);
  sendSuccess(res, null, 'Client deleted');
});

// POST /api/clients/:id/contract — upload contract PDF (admin, accountant)
router.post('/:id/contract', requirePermission('clients.edit'), memUpload.single('file'), async (req, res) => {
  if (!req.file) return sendError(res, 'No file uploaded');

  const Client = getModel(req, 'Client');
  const client = await Client.findById(req.params.id).select('-contractFile.data');
  if (!client) return sendError(res, 'Client not found', 404);

  client.contractFile = {
    data: req.file.buffer,
    contentType: req.file.mimetype,
    originalName: req.file.originalname,
    size: req.file.size,
    uploadedAt: new Date(),
  };
  await client.save();

  // Return without binary data
  const result = client.toObject();
  delete result.contractFile.data;
  sendSuccess(res, result, 'Contract uploaded');
});

// GET /api/clients/:id/contract — download/view contract PDF (all authenticated users)
router.get('/:id/contract', async (req, res) => {
  const Client = getModel(req, 'Client');
  const client = await Client.findById(req.params.id).select('contractFile').lean();
  if (!client) return sendError(res, 'Client not found', 404);
  if (!client.contractFile?.data) return sendError(res, 'No contract file found', 404);

  const disposition = req.query.download === 'true' ? 'attachment' : 'inline';
  res.setHeader('Content-Disposition', `${disposition}; filename="${client.contractFile.originalName}"`);
  res.setHeader('Content-Type', client.contractFile.contentType || 'application/pdf');
  res.setHeader('Content-Length', client.contractFile.data.length);
  res.send(client.contractFile.data);
});

// DELETE /api/clients/:id/contract — remove contract file (admin, accountant)
router.delete('/:id/contract', requirePermission('clients.edit'), async (req, res) => {
  const Client = getModel(req, 'Client');
  const client = await Client.findById(req.params.id).select('-contractFile.data');
  if (!client) return sendError(res, 'Client not found', 404);
  if (!client.contractFile?.originalName) return sendError(res, 'No contract file found', 404);

  client.contractFile = undefined;
  await client.save();

  sendSuccess(res, client, 'Contract removed');
});

// GET /api/clients/:id/drivers — list drivers for this client
router.get('/:id/drivers', async (req, res) => {
  const Driver = getModel(req, 'Driver');
  const page = parseInt(req.query.page) || PAGINATION.DEFAULT_PAGE;
  const limit = parseInt(req.query.limit) || PAGINATION.DEFAULT_LIMIT;
  const skip = (page - 1) * limit;

  const [drivers, total] = await Promise.all([
    Driver.find({ clientId: req.params.id })
      .sort({ fullName: 1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Driver.countDocuments({ clientId: req.params.id }),
  ]);

  sendPaginated(res, drivers, total, page, limit);
});

// GET /api/clients/:id/projects — all projects for this client with stats
router.get('/:id/projects', async (req, res) => {
  const projectService = require('../services/project.service');
  const result = await projectService.listProjects(
    req.params.id,
    { status: req.query.status },
    { page: req.query.page, limit: req.query.limit }
  );
  sendPaginated(res, result.projects, result.total, result.page, result.limit);
});

// GET /api/clients/:id/project-stats — aggregated stats for client dashboard
router.get('/:id/project-stats', async (req, res) => {
  const projectService = require('../services/project.service');
  const stats = await projectService.getProjectStats(req.params.id);
  sendSuccess(res, stats);
});

module.exports = router;
