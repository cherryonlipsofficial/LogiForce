const { body } = require('express-validator');
const { DEDUCTION_TYPES } = require('../../config/constants');

const runSalaryValidation = [
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
];

const adjustSalaryValidation = [
  body('type')
    .notEmpty().withMessage('Type is required')
    .isIn(['allowance', 'deduction', 'bonus', 'correction']).withMessage('Type must be allowance, deduction, bonus, or correction'),
  body('amount')
    .notEmpty().withMessage('Amount is required')
    .isFloat({ min: 0.01 }).withMessage('Amount must be a positive number'),
  body('reason')
    .trim()
    .notEmpty().withMessage('Reason is required')
    .isLength({ min: 3, max: 500 }).withMessage('Reason must be 3-500 characters'),
];

const disputeSalaryValidation = [
  body('reason')
    .trim()
    .notEmpty().withMessage('Dispute reason is required')
    .isLength({ min: 3, max: 500 }).withMessage('Reason must be 3-500 characters'),
];

const manualDeductionValidation = [
  body('type')
    .notEmpty().withMessage('Deduction type is required')
    .isIn(DEDUCTION_TYPES).withMessage(`Type must be one of: ${DEDUCTION_TYPES.join(', ')}`),
  body('amount')
    .notEmpty().withMessage('Amount is required')
    .isFloat({ min: 0.01 }).withMessage('Amount must be a positive number'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 }).withMessage('Description must be under 500 characters'),
];

const approvalRemarksValidation = [
  body('remarks')
    .optional()
    .trim()
    .isLength({ max: 500 }).withMessage('Remarks must be under 500 characters'),
];

module.exports = { runSalaryValidation, adjustSalaryValidation, disputeSalaryValidation, manualDeductionValidation, approvalRemarksValidation };
