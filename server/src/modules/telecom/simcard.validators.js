const { body } = require('express-validator');

const validateCreateSim = [
  body('simNumber')
    .trim()
    .notEmpty().withMessage('SIM number is required')
    .matches(/^(05\d{8}|\+9715\d{8})$/).withMessage('SIM number must be a valid UAE mobile number (e.g., 0504786709)'),
  body('operator')
    .optional()
    .isIn(['etisalat', 'du', 'virgin']).withMessage('Operator must be etisalat, du, or virgin'),
  body('monthlyPlanCost')
    .optional()
    .isFloat({ min: 0 }).withMessage('Monthly plan cost must be a positive number'),
  body('plan')
    .optional()
    .trim(),
  body('accountNumber')
    .optional()
    .trim(),
  body('accountOwner')
    .optional()
    .trim(),
  body('notes')
    .optional()
    .trim(),
];

const validateUpdateSim = [
  body('simNumber')
    .optional()
    .trim()
    .matches(/^(05\d{8}|\+9715\d{8})$/).withMessage('SIM number must be a valid UAE mobile number'),
  body('operator')
    .optional()
    .isIn(['etisalat', 'du', 'virgin']).withMessage('Operator must be etisalat, du, or virgin'),
  body('monthlyPlanCost')
    .optional()
    .isFloat({ min: 0 }).withMessage('Monthly plan cost must be a positive number'),
  body('status')
    .optional()
    .isIn(['active', 'idle', 'suspended', 'terminated']).withMessage('Invalid status'),
];

const validateAssignSim = [
  body('driverId')
    .notEmpty().withMessage('Driver ID is required')
    .isMongoId().withMessage('Invalid driver ID'),
  body('notes')
    .optional()
    .trim(),
];

module.exports = {
  validateCreateSim,
  validateUpdateSim,
  validateAssignSim,
};
