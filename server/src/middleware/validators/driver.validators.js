const { body } = require('express-validator');

const createDriverValidation = [
  body('fullName')
    .trim()
    .notEmpty().withMessage('Full name is required')
    .isLength({ min: 2, max: 200 }).withMessage('Full name must be 2-200 characters'),
  body('nationality')
    .trim()
    .notEmpty().withMessage('Nationality is required'),
  body('phoneUae')
    .trim()
    .notEmpty().withMessage('UAE phone number is required')
    .matches(/^\+?971\d{8,9}$/).withMessage('UAE phone must match format +971XXXXXXXXX'),
  body('baseSalary')
    .notEmpty().withMessage('Base salary is required')
    .isFloat({ min: 0 }).withMessage('Base salary must be a positive number'),
  body('payStructure')
    .notEmpty().withMessage('Pay structure is required')
    .isIn(['MONTHLY_FIXED', 'DAILY_RATE', 'PER_TRIP']).withMessage('Pay structure must be MONTHLY_FIXED, DAILY_RATE, or PER_TRIP'),
  body('status')
    .optional()
    .isIn(['draft', 'pending_kyc', 'active', 'on_leave', 'suspended', 'resigned', 'offboarding'])
    .withMessage('Invalid status value'),
  body('visaType')
    .optional()
    .isIn(['employment', 'investor', 'family', 'visit']).withMessage('Visa type must be employment, investor, family, or visit'),
  body('clientId')
    .optional()
    .isMongoId().withMessage('clientId must be a valid ID'),
  body('supplierId')
    .optional()
    .isMongoId().withMessage('supplierId must be a valid ID'),
  body('projectId')
    .notEmpty().withMessage('Project is required')
    .isMongoId().withMessage('projectId must be a valid ID'),
  body('phoneHomeCountry')
    .optional()
    .matches(/^\+?\d{7,15}$/).withMessage('Home country phone must be a valid phone number'),
  body('joinDate')
    .optional()
    .isISO8601().withMessage('Join date must be a valid date'),
  body('contractEndDate')
    .optional()
    .isISO8601().withMessage('Contract end date must be a valid date'),
  body('passportNumber')
    .optional()
    .trim(),
  body('passportExpiry')
    .optional()
    .isISO8601().withMessage('Passport expiry must be a valid date'),
  body('visaNumber')
    .optional()
    .trim(),
  body('visaExpiry')
    .optional()
    .isISO8601().withMessage('Visa expiry must be a valid date'),
  body('labourCardNo')
    .optional()
    .trim(),
  body('labourCardExpiry')
    .optional()
    .isISO8601().withMessage('Labour card expiry must be a valid date'),
  body('emiratesIdExpiry')
    .optional()
    .isISO8601().withMessage('Emirates ID expiry must be a valid date'),
  body('drivingLicenceExpiry')
    .optional()
    .isISO8601().withMessage('Driving licence expiry must be a valid date'),
  body('mulkiyaExpiry')
    .optional()
    .isISO8601().withMessage('Mulkiya expiry must be a valid date'),
];

const updateDriverValidation = [
  body('fullName')
    .optional()
    .trim()
    .isLength({ min: 2, max: 200 }).withMessage('Full name must be 2-200 characters'),
  body('phoneUae')
    .optional()
    .trim()
    .matches(/^\+?971\d{8,9}$/).withMessage('UAE phone must match format +971XXXXXXXXX'),
  body('baseSalary')
    .optional()
    .isFloat({ min: 0 }).withMessage('Base salary must be a positive number'),
  body('payStructure')
    .optional()
    .isIn(['MONTHLY_FIXED', 'DAILY_RATE', 'PER_TRIP']).withMessage('Pay structure must be MONTHLY_FIXED, DAILY_RATE, or PER_TRIP'),
  body('status')
    .optional()
    .isIn(['draft', 'pending_kyc', 'active', 'on_leave', 'suspended', 'resigned', 'offboarding'])
    .withMessage('Invalid status value'),
  body('visaType')
    .optional()
    .isIn(['employment', 'investor', 'family', 'visit']).withMessage('Invalid visa type'),
  body('clientId')
    .optional()
    .isMongoId().withMessage('clientId must be a valid ID'),
  body('projectId')
    .optional()
    .isMongoId().withMessage('projectId must be a valid ID'),
  body('joinDate')
    .optional()
    .isISO8601().withMessage('Join date must be a valid date'),
  body('contractEndDate')
    .optional()
    .isISO8601().withMessage('Contract end date must be a valid date'),
  body('passportNumber')
    .optional()
    .trim(),
  body('passportExpiry')
    .optional()
    .isISO8601().withMessage('Passport expiry must be a valid date'),
  body('visaNumber')
    .optional()
    .trim(),
  body('visaExpiry')
    .optional()
    .isISO8601().withMessage('Visa expiry must be a valid date'),
  body('labourCardNo')
    .optional()
    .trim(),
  body('labourCardExpiry')
    .optional()
    .isISO8601().withMessage('Labour card expiry must be a valid date'),
  body('emiratesIdExpiry')
    .optional()
    .isISO8601().withMessage('Emirates ID expiry must be a valid date'),
  body('drivingLicenceExpiry')
    .optional()
    .isISO8601().withMessage('Driving licence expiry must be a valid date'),
  body('mulkiyaExpiry')
    .optional()
    .isISO8601().withMessage('Mulkiya expiry must be a valid date'),
];

const changeStatusValidation = [
  body('status')
    .notEmpty().withMessage('Status is required')
    .isIn(['draft', 'pending_kyc', 'active', 'on_leave', 'suspended', 'resigned', 'offboarding'])
    .withMessage('Invalid status value'),
  body('reason')
    .optional()
    .trim()
    .isLength({ max: 500 }).withMessage('Reason must be under 500 characters'),
];

module.exports = { createDriverValidation, updateDriverValidation, changeStatusValidation };
