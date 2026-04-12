const { body } = require('express-validator');

const phoneRule = body('operationsContactPhone')
  .optional()
  .matches(/^\+?\d{7,15}$/).withMessage('Must be a valid phone number (no spaces, 7-15 digits)');

const salaryReleaseDayRule = body('salaryReleaseDay')
  .optional()
  .isInt({ min: 1, max: 28 }).withMessage('Salary release day must be between 1 and 28');

const createProjectValidation = [
  body('name')
    .trim()
    .notEmpty().withMessage('Project name is required')
    .isLength({ min: 2, max: 200 }).withMessage('Name must be 2-200 characters'),
  body('clientId')
    .notEmpty().withMessage('Client is required'),
  body('ratePerDriver')
    .notEmpty().withMessage('Rate per driver is required')
    .isFloat({ min: 0 }).withMessage('Rate per driver must be a positive number'),
  body('operationsContactEmail')
    .optional()
    .isEmail().withMessage('Must be a valid email'),
  phoneRule,
  salaryReleaseDayRule,
];

const updateProjectValidation = [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 200 }).withMessage('Name must be 2-200 characters'),
  body('ratePerDriver')
    .optional()
    .isFloat({ min: 0 }).withMessage('Rate per driver must be a positive number'),
  body('operationsContactEmail')
    .optional()
    .isEmail().withMessage('Must be a valid email'),
  phoneRule,
  salaryReleaseDayRule,
];

module.exports = { createProjectValidation, updateProjectValidation };
