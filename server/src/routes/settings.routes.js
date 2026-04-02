const express = require('express');
const router = express.Router();
const multer = require('multer');
const { protect, requirePermission } = require('../middleware/auth');
const { getModel } = require('../config/modelRegistry');
const { sendSuccess, sendError } = require('../utils/responseHelper');

const upload = multer({
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB max
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  },
});

router.use(protect);

// GET /api/settings/company — get current company settings
router.get('/company', async (req, res) => {
  const CompanySettings = getModel(req, 'CompanySettings');
  const settings = await CompanySettings.getSettings();
  sendSuccess(res, settings);
});

// PUT /api/settings/company — update company settings (admin only)
router.put('/company', requirePermission('settings.edit'), async (req, res) => {
  const CompanySettings = getModel(req, 'CompanySettings');
  const allowedFields = [
    'companyName', 'addressLine1', 'addressLine2', 'country', 'email', 'trn', 'phone',
    'bankAccountName', 'bankName', 'bankAccountNo', 'bankIban',
    'invoicePrefix', 'invoiceNumberFormat', 'disputeNoticeDays', 'vatRate',
  ];

  const settings = await CompanySettings.getSettings();

  for (const field of allowedFields) {
    if (req.body[field] !== undefined) {
      settings[field] = req.body[field];
    }
  }

  await settings.save();
  sendSuccess(res, settings, 'Company settings updated');
});

// POST /api/settings/company/logo — upload logo image
router.post('/company/logo', requirePermission('settings.edit'), upload.single('logo'), async (req, res) => {
  if (!req.file) return sendError(res, 'No image file provided', 400);

  const CompanySettings = getModel(req, 'CompanySettings');
  const settings = await CompanySettings.getSettings();
  settings.logoBase64 = req.file.buffer.toString('base64');
  await settings.save();

  sendSuccess(res, { message: 'Logo uploaded successfully' });
});

// POST /api/settings/company/stamp — upload stamp image
router.post('/company/stamp', requirePermission('settings.edit'), upload.single('stamp'), async (req, res) => {
  if (!req.file) return sendError(res, 'No image file provided', 400);

  const CompanySettings = getModel(req, 'CompanySettings');
  const settings = await CompanySettings.getSettings();
  settings.stampBase64 = req.file.buffer.toString('base64');
  await settings.save();

  sendSuccess(res, { message: 'Stamp uploaded successfully' });
});

// POST /api/settings/company/signature — upload signature image
router.post('/company/signature', requirePermission('settings.edit'), upload.single('signature'), async (req, res) => {
  if (!req.file) return sendError(res, 'No image file provided', 400);

  const CompanySettings = getModel(req, 'CompanySettings');
  const settings = await CompanySettings.getSettings();
  settings.signatureBase64 = req.file.buffer.toString('base64');
  await settings.save();

  sendSuccess(res, { message: 'Signature uploaded successfully' });
});

module.exports = router;
