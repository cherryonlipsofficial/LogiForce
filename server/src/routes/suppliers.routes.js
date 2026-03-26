const express = require('express');
const router = express.Router();
const { protect, requirePermission } = require('../middleware/auth');
const { Supplier, Vehicle } = require('../models');
const { sendSuccess, sendError, sendPaginated } = require('../utils/responseHelper');
const { PAGINATION } = require('../config/constants');
const validate = require('../middleware/validate');
const { createSupplierValidation, updateSupplierValidation } = require('../middleware/validators/supplier.validators');

// All routes are protected
router.use(protect);

// GET /api/suppliers
router.get('/', async (req, res) => {
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

  const [suppliers, total, vehicleCounts] = await Promise.all([
    Supplier.find(query).sort({ name: 1 }).skip(skip).limit(limit).lean(),
    Supplier.countDocuments(query),
    Vehicle.aggregate([
      { $group: { _id: '$supplierId', count: { $sum: 1 } } },
    ]),
  ]);

  const countMap = {};
  for (const vc of vehicleCounts) {
    if (vc._id) countMap[vc._id.toString()] = vc.count;
  }

  for (const supplier of suppliers) {
    supplier.vehicleCount = countMap[supplier._id.toString()] || 0;
  }

  sendPaginated(res, suppliers, total, page, limit);
});

// POST /api/suppliers
router.post('/', requirePermission('suppliers.create'), validate(createSupplierValidation), async (req, res) => {
  const supplier = await Supplier.create(req.body);
  sendSuccess(res, supplier, 'Supplier created', 201);
});

// GET /api/suppliers/:id
router.get('/:id', async (req, res) => {
  const supplier = await Supplier.findById(req.params.id);
  if (!supplier) return sendError(res, 'Supplier not found', 404);
  sendSuccess(res, supplier);
});

// PUT /api/suppliers/:id
router.put('/:id', requirePermission('suppliers.edit'), validate(updateSupplierValidation), async (req, res) => {
  const supplier = await Supplier.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });
  if (!supplier) return sendError(res, 'Supplier not found', 404);
  sendSuccess(res, supplier, 'Supplier updated');
});

// DELETE /api/suppliers/:id
router.delete('/:id', requirePermission('suppliers.delete'), async (req, res) => {
  const supplier = await Supplier.findByIdAndDelete(req.params.id);
  if (!supplier) return sendError(res, 'Supplier not found', 404);
  sendSuccess(res, null, 'Supplier deleted');
});

module.exports = router;
