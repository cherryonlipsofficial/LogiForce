const { body } = require('express-validator');

const createSupplierValidation = [
  body('name')
    .trim()
    .notEmpty().withMessage('Supplier name is required')
    .isLength({ min: 2, max: 200 }).withMessage('Name must be 2-200 characters'),
  body('serviceType')
    .optional()
    .isIn(['Lease only', 'Full fleet', 'Lease + maintenance', 'Driver-owned']).withMessage('Invalid service type'),
  body('contactEmail')
    .optional()
    .isEmail().withMessage('Must be a valid email'),
];

const updateSupplierValidation = [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 200 }).withMessage('Name must be 2-200 characters'),
  body('serviceType')
    .optional()
    .isIn(['Lease only', 'Full fleet', 'Lease + maintenance', 'Driver-owned']).withMessage('Invalid service type'),
  body('contactEmail')
    .optional()
    .isEmail().withMessage('Must be a valid email'),
];

module.exports = { createSupplierValidation, updateSupplierValidation };
