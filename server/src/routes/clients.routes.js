const express = require('express');
const router = express.Router();
const multer = require('multer');
const { protect, restrictTo } = require('../middleware/auth');
const { Client, Driver } = require('../models');
const { sendSuccess, sendError, sendPaginated } = require('../utils/responseHelper');
const { PAGINATION } = require('../config/constants');
const validate = require('../middleware/validate');
const { createClientValidation, updateClientValidation } = require('../middleware/validators/client.validators');
const { uploadToGridFS, downloadFromGridFS, getFileInfo, deleteFromGridFS } = require('../config/gridfs');

// Memory storage for upload — files go to MongoDB GridFS
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
  const client = await Client.findById(req.params.id);
  if (!client) return sendError(res, 'Client not found', 404);

  // Clean up GridFS file if exists
  if (client.contractFile?.fileId) {
    try { await deleteFromGridFS(client.contractFile.fileId); } catch (_) { /* ignore */ }
  }

  await Client.findByIdAndDelete(client._id);
  sendSuccess(res, null, 'Client deleted');
});

// POST /api/clients/:id/contract — upload contract PDF to MongoDB GridFS (admin, accountant)
router.post('/:id/contract', restrictTo('admin', 'accountant'), memUpload.single('file'), async (req, res) => {
  if (!req.file) return sendError(res, 'No file uploaded');

  const client = await Client.findById(req.params.id);
  if (!client) return sendError(res, 'Client not found', 404);

  // Delete old file from GridFS if replacing
  if (client.contractFile?.fileId) {
    try { await deleteFromGridFS(client.contractFile.fileId); } catch (_) { /* ignore */ }
  }

  // Upload to GridFS
  const { fileId } = await uploadToGridFS(req.file.buffer, req.file.originalname, {
    contentType: req.file.mimetype,
    originalName: req.file.originalname,
    uploadedFor: 'client-contract',
    clientId: req.params.id,
  });

  client.contractFile = {
    fileId: fileId.toString(),
    contentType: req.file.mimetype,
    originalName: req.file.originalname,
    size: req.file.size,
    uploadedAt: new Date(),
  };
  await client.save();

  sendSuccess(res, client, 'Contract uploaded');
});

// GET /api/clients/:id/contract — download/view contract PDF from GridFS (all authenticated users)
router.get('/:id/contract', async (req, res) => {
  const client = await Client.findById(req.params.id).select('contractFile');
  if (!client) return sendError(res, 'Client not found', 404);
  if (!client.contractFile?.fileId) return sendError(res, 'No contract file found', 404);

  const fileInfo = await getFileInfo(client.contractFile.fileId);
  if (!fileInfo) return sendError(res, 'File not found in storage', 404);

  const disposition = req.query.download === 'true' ? 'attachment' : 'inline';
  res.setHeader('Content-Disposition', `${disposition}; filename="${client.contractFile.originalName}"`);
  res.setHeader('Content-Type', client.contractFile.contentType || 'application/pdf');
  if (fileInfo.length) res.setHeader('Content-Length', fileInfo.length);

  const downloadStream = downloadFromGridFS(client.contractFile.fileId);
  downloadStream.pipe(res);
});

// DELETE /api/clients/:id/contract — remove contract file from GridFS (admin, accountant)
router.delete('/:id/contract', restrictTo('admin', 'accountant'), async (req, res) => {
  const client = await Client.findById(req.params.id);
  if (!client) return sendError(res, 'Client not found', 404);
  if (!client.contractFile?.fileId) return sendError(res, 'No contract file found', 404);

  // Delete from GridFS
  try { await deleteFromGridFS(client.contractFile.fileId); } catch (_) { /* ignore */ }

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
