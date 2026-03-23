const express = require('express');
const router = express.Router();
const { protect, restrictTo } = require('../middleware/auth');
const { Supplier } = require('../models');
const { sendSuccess, sendError } = require('../utils/responseHelper');
const validate = require('../middleware/validate');
const { createSupplierValidation, updateSupplierValidation } = require('../middleware/validators/supplier.validators');

// All routes are protected and admin only
router.use(protect);
router.use(restrictTo('admin'));

// GET /api/suppliers
router.get('/', async (req, res) => {
  const suppliers = await Supplier.find().sort({ name: 1 });
  sendSuccess(res, suppliers);
});

// POST /api/suppliers
router.post('/', validate(createSupplierValidation), async (req, res) => {
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
router.put('/:id', validate(updateSupplierValidation), async (req, res) => {
  const supplier = await Supplier.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });
  if (!supplier) return sendError(res, 'Supplier not found', 404);
  sendSuccess(res, supplier, 'Supplier updated');
});

// DELETE /api/suppliers/:id
router.delete('/:id', async (req, res) => {
  const supplier = await Supplier.findByIdAndUpdate(
    req.params.id,
    { isActive: false },
    { new: true }
  );
  if (!supplier) return sendError(res, 'Supplier not found', 404);
  sendSuccess(res, supplier, 'Supplier deactivated');
});

module.exports = router;
