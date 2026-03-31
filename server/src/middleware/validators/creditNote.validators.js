const { body } = require('express-validator');

const createCreditNoteValidation = [
  body('clientId')
    .notEmpty().withMessage('clientId is required')
    .isMongoId().withMessage('clientId must be a valid ID'),
  body('projectId')
    .notEmpty().withMessage('projectId is required')
    .isMongoId().withMessage('projectId must be a valid ID'),
  body('year')
    .notEmpty().withMessage('Year is required')
    .isInt({ min: 2020, max: 2100 }).withMessage('Year must be between 2020 and 2100'),
  body('month')
    .notEmpty().withMessage('Month is required')
    .isInt({ min: 1, max: 12 }).withMessage('Month must be between 1 and 12'),
  body('description')
    .trim()
    .notEmpty().withMessage('Description is required')
    .isLength({ min: 3, max: 500 }).withMessage('Description must be 3-500 characters'),
  body('noteType')
    .notEmpty().withMessage('Note type is required')
    .isIn(['traffic_fine', 'penalty', 'damage', 'client_chargeback', 'attendance_correction', 'excess_insurance', 'salik', 'tots', 'accident_report', 'misuse', 'cod', 'other'])
    .withMessage('Invalid note type'),
  body('lineItems')
    .isArray({ min: 1 }).withMessage('At least one line item is required'),
  body('lineItems.*.driverId')
    .notEmpty().withMessage('Driver ID is required')
    .isMongoId().withMessage('Driver ID must be a valid ID'),
  body('lineItems.*.amount')
    .notEmpty().withMessage('Amount is required')
    .isFloat({ min: 0.01 }).withMessage('Amount must be a positive number'),
  body('lineItems.*.referenceNo')
    .optional()
    .trim(),
  body('lineItems.*.vatRate')
    .optional()
    .isFloat({ min: 0, max: 1 }).withMessage('VAT rate must be between 0 and 1'),
];

const adjustCreditNoteValidation = [
  body('invoiceId')
    .notEmpty().withMessage('invoiceId is required')
    .isMongoId().withMessage('invoiceId must be a valid ID'),
];

const resolveLineValidation = [
  body('note')
    .trim()
    .notEmpty().withMessage('Resolution note is required')
    .isLength({ min: 3, max: 500 }).withMessage('Note must be 3-500 characters'),
];

module.exports = {
  createCreditNoteValidation,
  adjustCreditNoteValidation,
  resolveLineValidation,
};
