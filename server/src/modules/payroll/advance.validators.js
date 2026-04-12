const { body } = require('express-validator');

const issueAdvanceValidation = [
  body('driverId')
    .notEmpty().withMessage('driverId is required')
    .isMongoId().withMessage('driverId must be a valid ID'),
  body('amountIssued')
    .notEmpty().withMessage('amountIssued is required')
    .isFloat({ min: 0.01 }).withMessage('Amount must be a positive number'),
  body('notes')
    .optional()
    .trim()
    .isLength({ max: 500 }).withMessage('Notes must be under 500 characters'),
];

const recoverAdvanceValidation = [
  body('amount')
    .notEmpty().withMessage('Amount is required')
    .isFloat({ min: 0.01 }).withMessage('Amount must be a positive number'),
  body('salaryRunId')
    .optional()
    .isMongoId().withMessage('salaryRunId must be a valid ID'),
];

module.exports = { issueAdvanceValidation, recoverAdvanceValidation };
