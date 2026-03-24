const express = require('express');
const router = express.Router();
const { protect, restrictTo } = require('../middleware/auth');
const { Supplier, Vehicle } = require('../models');
const { sendSuccess, sendError } = require('../utils/responseHelper');
const validate = require('../middleware/validate');
const { createSupplierValidation, updateSupplierValidation } = require('../middleware/validators/supplier.validators');

// All routes are protected
router.use(protect);

// GET /api/suppliers
router.get('/', async (req, res) => {
  const [suppliers, vehicleCounts] = await Promise.all([
    Supplier.find().sort({ name: 1 }).lean(),
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

  sendSuccess(res, suppliers);
});

// POST /api/suppliers
router.post('/', restrictTo('admin', 'accountant'), validate(createSupplierValidation), async (req, res) => {
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
router.put('/:id', restrictTo('admin', 'accountant'), validate(updateSupplierValidation), async (req, res) => {
  const supplier = await Supplier.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });
  if (!supplier) return sendError(res, 'Supplier not found', 404);
  sendSuccess(res, supplier, 'Supplier updated');
});

// DELETE /api/suppliers/:id
router.delete('/:id', restrictTo('admin'), async (req, res) => {
  const supplier = await Supplier.findByIdAndDelete(req.params.id);
  if (!supplier) return sendError(res, 'Supplier not found', 404);
  sendSuccess(res, null, 'Supplier deleted');
});

module.exports = router;
