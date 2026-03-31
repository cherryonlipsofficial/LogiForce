const { body } = require('express-validator');

const generateInvoiceValidation = [
  body('clientId')
    .notEmpty().withMessage('clientId is required')
    .isMongoId().withMessage('clientId must be a valid ID'),
  body('projectId')
    .optional()
    .isMongoId().withMessage('projectId must be a valid ID'),
  body('year')
    .notEmpty().withMessage('Year is required')
    .isInt({ min: 2020, max: 2100 }).withMessage('Year must be between 2020 and 2100'),
  body('month')
    .notEmpty().withMessage('Month is required')
    .isInt({ min: 1, max: 12 }).withMessage('Month must be between 1 and 12'),
  body('attendanceBatchIds')
    .optional()
    .isArray({ min: 1 }).withMessage('attendanceBatchIds must be a non-empty array'),
  body('attendanceBatchIds.*')
    .optional()
    .isMongoId().withMessage('Each attendanceBatchId must be a valid ID'),
];

const updateInvoiceStatusValidation = [
  body('status')
    .notEmpty().withMessage('Status is required')
    .isIn(['sent', 'paid', 'cancelled']).withMessage('Status must be sent, paid, or cancelled'),
];

module.exports = { generateInvoiceValidation, updateInvoiceStatusValidation };
