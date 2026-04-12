const { body } = require('express-validator');

const recordRecoveryValidation = [
  body('method')
    .notEmpty().withMessage('Recovery method is required')
    .isIn(['cash', 'bank_transfer', 'security_deposit', 'salary_deduction', 'other'])
    .withMessage('Invalid recovery method'),
  body('amount')
    .notEmpty().withMessage('Amount is required')
    .isFloat({ min: 0.01 }).withMessage('Amount must be a positive number'),
  body('reference')
    .optional()
    .trim()
    .isLength({ max: 200 }).withMessage('Reference must be under 200 characters'),
  body('note')
    .optional()
    .trim()
    .isLength({ max: 500 }).withMessage('Note must be under 500 characters'),
];

const writeOffValidation = [
  body('reason')
    .trim()
    .notEmpty().withMessage('Write-off reason is required')
    .isLength({ min: 3, max: 500 }).withMessage('Reason must be 3-500 characters'),
];

module.exports = {
  recordRecoveryValidation,
  writeOffValidation,
};
