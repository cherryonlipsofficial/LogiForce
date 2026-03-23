const express = require('express');
const router = express.Router();
const { protect, restrictTo } = require('../middleware/auth');
const { Client, Driver } = require('../models');
const { sendSuccess, sendError, sendPaginated } = require('../utils/responseHelper');
const { PAGINATION } = require('../config/constants');
const validate = require('../middleware/validate');
const { createClientValidation, updateClientValidation } = require('../middleware/validators/client.validators');

// All routes are protected
router.use(protect);

// GET /api/clients — list all clients
router.get('/', async (req, res) => {
  const clients = await Client.find().sort({ name: 1 });
  sendSuccess(res, clients);
});

// POST /api/clients — create (admin)
router.post('/', restrictTo('admin'), validate(createClientValidation), async (req, res) => {
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

// PUT /api/clients/:id — update (admin)
router.put('/:id', restrictTo('admin'), validate(updateClientValidation), async (req, res) => {
  const client = await Client.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });
  if (!client) return sendError(res, 'Client not found', 404);
  sendSuccess(res, client, 'Client updated');
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
