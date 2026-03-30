const { body } = require('express-validator');

const createClientValidation = [
  body('name')
    .trim()
    .notEmpty().withMessage('Client name is required')
    .isLength({ min: 2, max: 200 }).withMessage('Name must be 2-200 characters'),
  body('contactEmail')
    .optional()
    .isEmail().withMessage('Must be a valid email'),
  body('contactPhone')
    .optional()
    .matches(/^\+?\d{7,15}$/).withMessage('Must be a valid phone number'),
];

const updateClientValidation = [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 200 }).withMessage('Name must be 2-200 characters'),
  body('contactEmail')
    .optional()
    .isEmail().withMessage('Must be a valid email'),
];

module.exports = { createClientValidation, updateClientValidation };
