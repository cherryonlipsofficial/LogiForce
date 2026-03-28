const { body } = require('express-validator');

const uploadAttendanceValidation = [
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

const overrideRecordValidation = [
  body('reason')
    .trim()
    .notEmpty().withMessage('Override reason is required')
    .isLength({ min: 3, max: 500 }).withMessage('Reason must be 3-500 characters'),
  body('workingDays')
    .optional()
    .isInt({ min: 0, max: 31 }).withMessage('Working days must be 0-31'),
  body('overtimeHours')
    .optional()
    .isFloat({ min: 0, max: 500 }).withMessage('Overtime hours must be 0-500'),
];

module.exports = { uploadAttendanceValidation, overrideRecordValidation };
