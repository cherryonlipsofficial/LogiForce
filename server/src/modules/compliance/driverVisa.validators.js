const { body, param } = require('express-validator');

const VISA_CATEGORIES = ['company_visa', 'twp'];

const createVisaValidation = [
  body('driverId')
    .notEmpty().withMessage('driverId is required')
    .isMongoId().withMessage('driverId must be a valid ID'),
  body('visaCategory')
    .notEmpty().withMessage('visaCategory is required')
    .isIn(VISA_CATEGORIES).withMessage(`visaCategory must be one of: ${VISA_CATEGORIES.join(', ')}`),
  body('visaLabel').optional().trim().isLength({ max: 64 }),
  body('referenceName').optional().trim().isLength({ max: 128 }),
  body('visaNumber').optional().trim().isLength({ max: 64 }),
  body('issueDate').optional().isISO8601().withMessage('issueDate must be a valid date'),
  body('expiryDate').optional().isISO8601().withMessage('expiryDate must be a valid date'),
  body('totalCost').optional().isFloat({ min: 0 }),
  body('medicalInsuranceCost').optional().isFloat({ min: 0 }),
  body('discountAmount').optional().isFloat({ min: 0 }),
  body('cashPaid').optional().isFloat({ min: 0 }),
  body('monthlyDeduction').optional().isFloat({ min: 0 }),
  body('remarks').optional().trim().isLength({ max: 1000 }),
];

const updateBasicsValidation = [
  param('id').isMongoId().withMessage('Invalid visa id'),
  body('visaCategory').optional().isIn(VISA_CATEGORIES),
  body('visaLabel').optional().trim().isLength({ max: 64 }),
  body('referenceName').optional().trim().isLength({ max: 128 }),
  body('visaNumber').optional().trim().isLength({ max: 64 }),
  body('issueDate').optional().isISO8601(),
  body('expiryDate').optional().isISO8601(),
  body('remarks').optional().trim().isLength({ max: 1000 }),
];

const updateFinancialsValidation = [
  param('id').isMongoId().withMessage('Invalid visa id'),
  body('totalCost').optional().isFloat({ min: 0 }),
  body('medicalInsuranceCost').optional().isFloat({ min: 0 }),
  body('discountAmount').optional().isFloat({ min: 0 }),
  body('cashPaid').optional().isFloat({ min: 0 }),
  body('monthlyDeduction').optional().isFloat({ min: 0 }),
  body('remarks').optional().trim().isLength({ max: 1000 }),
];

const reasonValidation = [
  param('id').isMongoId().withMessage('Invalid visa id'),
  body('reason').optional().trim().isLength({ max: 500 }),
];

const lineItemValidation = [
  param('id').isMongoId().withMessage('Invalid visa id'),
  body('direction')
    .notEmpty().withMessage('direction is required')
    .isIn(['expense', 'received']).withMessage('direction must be "expense" or "received"'),
  body('label')
    .notEmpty().withMessage('label is required')
    .trim()
    .isLength({ min: 1, max: 120 }).withMessage('label must be 1-120 characters'),
  body('amount')
    .notEmpty().withMessage('amount is required')
    .isFloat({ gt: 0 }).withMessage('amount must be greater than 0'),
  body('date').optional().isISO8601(),
  body('notes').optional().trim().isLength({ max: 500 }),
];

const processingValidation = [
  param('id').isMongoId().withMessage('Invalid visa id'),
  body('processedDate')
    .optional()
    .isISO8601().withMessage('processedDate must be a valid date'),
];

module.exports = {
  createVisaValidation,
  updateBasicsValidation,
  updateFinancialsValidation,
  reasonValidation,
  lineItemValidation,
  processingValidation,
};
