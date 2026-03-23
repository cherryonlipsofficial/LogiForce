const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { protect, restrictTo } = require('../middleware/auth');
const { Client, Driver } = require('../models');
const { sendSuccess, sendError, sendPaginated } = require('../utils/responseHelper');
const { PAGINATION } = require('../config/constants');
const validate = require('../middleware/validate');
const { createClientValidation, updateClientValidation } = require('../middleware/validators/client.validators');
const upload = require('../middleware/upload');

const uploadsDir = path.join(__dirname, '..', '..', 'uploads');

// All routes are protected
router.use(protect);

// GET /api/clients — list all clients
router.get('/', async (req, res) => {
  const clients = await Client.find().sort({ name: 1 });
  sendSuccess(res, clients);
});

// POST /api/clients — create (admin, accountant)
router.post('/', restrictTo('admin', 'accountant'), validate(createClientValidation), async (req, res) => {
  const client = await Client.create(req.body);
  sendSuccess(res, client, 'Client created', 201);
});

// GET /api/clients/:id — get with driver count
router.get('/:id', async (req, res) => {
  const client = await Client.findById(req.params.id);
  if (!client) return sendError(res, 'Client not found', 404);

  const driverCount = await Driver.countDocuments({ clientId: req.params.id });
  const result = client.toObject();
  result.driverCount = driverCount;

  sendSuccess(res, result);
});

// PUT /api/clients/:id — update (admin, accountant)
router.put('/:id', restrictTo('admin', 'accountant'), validate(updateClientValidation), async (req, res) => {
  const client = await Client.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });
  if (!client) return sendError(res, 'Client not found', 404);
  sendSuccess(res, client, 'Client updated');
});

// DELETE /api/clients/:id — delete (admin)
router.delete('/:id', restrictTo('admin'), async (req, res) => {
  const client = await Client.findByIdAndDelete(req.params.id);
  if (!client) return sendError(res, 'Client not found', 404);
  sendSuccess(res, null, 'Client deleted');
});

// POST /api/clients/:id/contract — upload contract PDF (admin, accountant)
router.post('/:id/contract', restrictTo('admin', 'accountant'), upload.single('file'), async (req, res) => {
  if (!req.file) return sendError(res, 'No file uploaded');

  const client = await Client.findById(req.params.id);
  if (!client) return sendError(res, 'Client not found', 404);

  // Delete old file if exists
  if (client.contractFile?.fileKey) {
    const oldPath = path.join(uploadsDir, client.contractFile.fileKey);
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
  }

  client.contractFile = {
    fileKey: req.file.filename,
    originalName: req.file.originalname,
    uploadedAt: new Date(),
  };
  await client.save();

  sendSuccess(res, client, 'Contract uploaded');
});

// GET /api/clients/:id/contract — download/view contract PDF (all authenticated users)
router.get('/:id/contract', async (req, res) => {
  const client = await Client.findById(req.params.id);
  if (!client) return sendError(res, 'Client not found', 404);
  if (!client.contractFile?.fileKey) return sendError(res, 'No contract file found', 404);

  const filePath = path.join(uploadsDir, client.contractFile.fileKey);
  if (!fs.existsSync(filePath)) return sendError(res, 'File not found on server', 404);

  const disposition = req.query.download === 'true' ? 'attachment' : 'inline';
  res.setHeader('Content-Disposition', `${disposition}; filename="${client.contractFile.originalName}"`);
  res.setHeader('Content-Type', 'application/pdf');
  fs.createReadStream(filePath).pipe(res);
});

// DELETE /api/clients/:id/contract — remove contract file (admin, accountant)
router.delete('/:id/contract', restrictTo('admin', 'accountant'), async (req, res) => {
  const client = await Client.findById(req.params.id);
  if (!client) return sendError(res, 'Client not found', 404);
  if (!client.contractFile?.fileKey) return sendError(res, 'No contract file found', 404);

  const filePath = path.join(uploadsDir, client.contractFile.fileKey);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

  client.contractFile = undefined;
  await client.save();

  sendSuccess(res, client, 'Contract removed');
});

// GET /api/clients/:id/drivers — list drivers for this client
router.get('/:id/drivers', async (req, res) => {
  const page = parseInt(req.query.page) || PAGINATION.DEFAULT_PAGE;
  const limit = parseInt(req.query.limit) || PAGINATION.DEFAULT_LIMIT;
  const skip = (page - 1) * limit;

  const [drivers, total] = await Promise.all([
    Driver.find({ clientId: req.params.id })
      .sort({ fullName: 1 })
      .skip(skip)
      .limit(limit),
    Driver.countDocuments({ clientId: req.params.id }),
  ]);

  sendPaginated(res, drivers, total, page, limit);
});

module.exports = router;
