const { body, param } = require('express-validator');

const VISA_CATEGORIES = ['company_visa', 'twp'];

const createVisaValidation = [
  body('driverId')
    .notEmpty().withMessage('driverId is required')
    .isMongoId().withMessage('driverId must be a valid ID'),
  body('visaCategory')
    .notEmpty().withMessage('visaCategory is required')
    .isIn(VISA_CATEGORIES).withMessage(`visaCategory must be one of: ${VISA_CATEGORIES.join(', ')}`),
  body('visaNumber').optional().trim().isLength({ max: 64 }),
  body('issueDate').optional().isISO8601().withMessage('issueDate must be a valid date'),
  body('expiryDate').optional().isISO8601().withMessage('expiryDate must be a valid date'),
  body('totalCost')
    .optional()
    .isFloat({ min: 0 }).withMessage('totalCost must be >= 0'),
  body('discountAmount')
    .optional()
    .isFloat({ min: 0 }).withMessage('discountAmount must be >= 0'),
  body('cashPaid')
    .optional()
    .isFloat({ min: 0 }).withMessage('cashPaid must be >= 0'),
  body('monthlyDeduction')
    .optional()
    .isFloat({ min: 0 }).withMessage('monthlyDeduction must be >= 0'),
  body('remarks').optional().trim().isLength({ max: 1000 }),
];

const updateBasicsValidation = [
  param('id').isMongoId().withMessage('Invalid visa id'),
  body('visaCategory').optional().isIn(VISA_CATEGORIES),
  body('visaNumber').optional().trim().isLength({ max: 64 }),
  body('issueDate').optional().isISO8601(),
  body('expiryDate').optional().isISO8601(),
  body('remarks').optional().trim().isLength({ max: 1000 }),
];

const updateFinancialsValidation = [
  param('id').isMongoId().withMessage('Invalid visa id'),
  body('totalCost').optional().isFloat({ min: 0 }),
  body('discountAmount').optional().isFloat({ min: 0 }),
  body('cashPaid').optional().isFloat({ min: 0 }),
  body('monthlyDeduction').optional().isFloat({ min: 0 }),
  body('remarks').optional().trim().isLength({ max: 1000 }),
];

const reasonValidation = [
  param('id').isMongoId().withMessage('Invalid visa id'),
  body('reason').optional().trim().isLength({ max: 500 }),
];

module.exports = {
  createVisaValidation,
  updateBasicsValidation,
  updateFinancialsValidation,
  reasonValidation,
};
