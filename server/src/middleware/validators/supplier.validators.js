const { body } = require('express-validator');

const createSupplierValidation = [
  body('name')
    .trim()
    .notEmpty().withMessage('Supplier name is required')
    .isLength({ min: 2, max: 200 }).withMessage('Name must be 2-200 characters'),
  body('type')
    .notEmpty().withMessage('Supplier type is required')
    .isIn(['vehicle_leasing', 'telecom', 'other']).withMessage('Type must be vehicle_leasing, telecom, or other'),
  body('monthlyRate')
    .optional()
    .isFloat({ min: 0 }).withMessage('Monthly rate must be a positive number'),
  body('contactEmail')
    .optional()
    .isEmail().withMessage('Must be a valid email'),
];

const updateSupplierValidation = [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 200 }).withMessage('Name must be 2-200 characters'),
  body('type')
    .optional()
    .isIn(['vehicle_leasing', 'telecom', 'other']).withMessage('Type must be vehicle_leasing, telecom, or other'),
  body('monthlyRate')
    .optional()
    .isFloat({ min: 0 }).withMessage('Monthly rate must be a positive number'),
];

module.exports = { createSupplierValidation, updateSupplierValidation };
