const express = require('express');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const { protect, requirePermission } = require('../middleware/auth');
const upload = require('../middleware/upload');
const driverService = require('../services/driver.service');
const { Driver, DriverDocument, SalaryRun } = require('../models');
const { sendSuccess, sendError, sendPaginated } = require('../utils/responseHelper');
const validate = require('../middleware/validate');
const { createDriverValidation, updateDriverValidation, changeStatusValidation } = require('../middleware/validators/driver.validators');
const auditLogger = require('../utils/auditLogger');

// All routes are protected
router.use(protect);

// GET /api/drivers/expiring-documents — must be before /:id routes
router.get('/expiring-documents', async (req, res) => {
  const days = parseInt(req.query.days) || 30;
  const docs = await driverService.getExpiringDocuments(days);
  sendSuccess(res, docs);
});

// GET /api/drivers/uploads/:fileKey — redirect to Cloudinary URL (must be before /:id)
router.get('/uploads/:fileKey', async (req, res) => {
  const fileKey = req.params.fileKey;
  // Look up the document to get its Cloudinary URL
  const doc = await DriverDocument.findOne({ fileKey });
  if (!doc || !doc.fileUrl) {
    return sendError(res, 'File not found', 404);
  }
  res.redirect(doc.fileUrl);
});

// GET /api/drivers/status-counts — counts by status for KPI cards
router.get('/status-counts', async (req, res) => {
  const counts = await driverService.getStatusCounts();
  sendSuccess(res, counts);
});

// GET /api/drivers/export — export drivers as CSV
router.get('/export', async (req, res) => {
  const { status, clientId, projectId, search } = req.query;
  const result = await driverService.findAll(
    { status, clientId, projectId, search },
    { page: 1, limit: 10000 }
  );
  const drivers = result.drivers;

  const headers = ['Employee Code', 'Full Name', 'Nationality', 'Phone UAE', 'Project', 'Vehicle', 'Status', 'Pay Structure', 'Base Salary', 'Join Date', 'Emirates ID'];
  const escapeCsv = (val) => {
    const str = String(val ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  const rows = drivers.map((d) => [
    d.employeeCode,
    d.fullName,
    d.nationality,
    d.phoneUae,
    d.projectId?.name || '',
    d.vehiclePlate || '',
    d.status,
    d.payStructure,
    d.baseSalary,
    d.joinDate ? new Date(d.joinDate).toLocaleDateString() : '',
    d.emiratesId,
  ].map(escapeCsv).join(','));

  const csv = [headers.join(','), ...rows].join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=drivers-export.csv');
  res.send(csv);
});

// POST /api/drivers/bulk-import — bulk import from CSV/XLSX
// Use memory storage (not Cloudinary) since we need to parse the file locally
const memoryUpload = require('multer')({ storage: require('multer').memoryStorage() });
router.post('/bulk-import', requirePermission('drivers.create'), (req, res, next) => {
  memoryUpload.single('file')(req, res, (err) => {
    if (err) {
      return sendError(res, `File upload error: ${err.message}`, 400);
    }
    next();
  });
}, async (req, res) => {
  if (!req.file) return sendError(res, 'No file uploaded', 400);

  try {
    const ext = path.extname(req.file.originalname).toLowerCase();
    let rows = [];

    if (ext === '.csv') {
      const { Readable } = require('stream');
      const csvParser = require('csv-parser');
      rows = await new Promise((resolve, reject) => {
        const results = [];
        Readable.from(req.file.buffer)
          .pipe(csvParser())
          .on('data', (data) => results.push(data))
          .on('end', () => resolve(results))
          .on('error', reject);
      });
    } else if (ext === '.xlsx' || ext === '.xls') {
      const XLSX = require('xlsx');
      const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
    } else {
      return sendError(res, 'Unsupported file format. Use .csv or .xlsx', 400);
    }

    if (rows.length === 0) return sendError(res, 'File is empty or has no data rows', 400);
    if (rows.length > 500) return sendError(res, 'Maximum 500 rows per import', 400);

    const result = await driverService.bulkCreate(rows, req.user._id);
    sendSuccess(res, result, `Imported ${result.created} drivers${result.errors.length > 0 ? ` with ${result.errors.length} errors` : ''}`, 201);
  } catch (err) {
    console.error('[BulkImport Error]', err);
    return sendError(res, `Failed to process file: ${err.message}`, 400);
  }
});

// GET /api/drivers/bulk-import/template — download CSV template
router.get('/bulk-import/template', async (req, res) => {
  const headers = ['fullName', 'nationality', 'phoneUae', 'baseSalary', 'payStructure', 'clientId', 'emiratesId', 'joinDate', 'passportNumber', 'visaNumber', 'bankName', 'iban', 'vehiclePlate', 'vehicleType', 'status'];
  const exampleRow = ['Mohamed Al Farsi', 'Emirati', '+971501234567', '2800', 'MONTHLY_FIXED', 'Amazon UAE', '784-1985-1234567-1', '2023-03-01', '', '', '', '', '', '', ''];
  const csv = [headers.join(','), exampleRow.join(',')].join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=drivers-import-template.csv');
  res.send(csv);
});

// GET /api/drivers — list with pagination, search, filter
router.get('/', async (req, res) => {
  const { status, clientId, projectId, search, page, limit } = req.query;
  const result = await driverService.findAll(
    { status, clientId, projectId, search },
    { page, limit }
  );
  sendPaginated(res, result.drivers, result.total, result.page, result.limit);
});

// POST /api/drivers — create (ops, admin)
router.post('/', requirePermission('drivers.create'), validate(createDriverValidation), async (req, res) => {
  const driver = await driverService.create(req.body, req.user._id);
  sendSuccess(res, driver, 'Driver created', 201);
});

// GET /api/drivers/:id — get single driver
router.get('/:id', async (req, res) => {
  const driver = await driverService.findById(req.params.id);
  sendSuccess(res, driver);
});

// PUT /api/drivers/:id — update (ops, admin)
router.put('/:id', requirePermission('drivers.edit'), validate(updateDriverValidation), async (req, res) => {
  const driver = await driverService.update(req.params.id, req.body);
  sendSuccess(res, driver, 'Driver updated');
});

// DELETE /api/drivers/:id — soft delete (admin only)
router.delete('/:id', requirePermission('drivers.delete'), async (req, res) => {
  const driver = await driverService.softDelete(req.params.id);
  sendSuccess(res, driver, 'Driver set to resigned');
});

// GET /api/drivers/:id/ledger — paginated ledger
router.get('/:id/ledger', async (req, res) => {
  const { page, limit } = req.query;
  const result = await driverService.getLedger(req.params.id, { page, limit });
  sendPaginated(res, result.entries, result.total, result.page, result.limit);
});

// GET /api/drivers/:id/salary-runs — list salary runs for driver
router.get('/:id/salary-runs', async (req, res) => {
  const runs = await SalaryRun.find({ driverId: req.params.id })
    .sort({ createdAt: -1 })
    .populate('clientId', 'name');
  sendSuccess(res, runs);
});

// GET /api/drivers/:id/documents — list documents for a driver
router.get('/:id/documents', async (req, res) => {
  const docs = await DriverDocument.find({ driverId: req.params.id })
    .sort({ createdAt: -1 });
  sendSuccess(res, docs);
});

// POST /api/drivers/:id/documents — upload document
router.post('/:id/documents', requirePermission('drivers.manage_docs'), (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      return sendError(res, `File upload error: ${err.message}`, 400);
    }
    next();
  });
}, async (req, res) => {
  try {
    const driver = await Driver.findById(req.params.id);
    if (!driver) return sendError(res, 'Driver not found', 404);

    if (!req.file) return sendError(res, 'No file uploaded', 400);

    const fileKey = req.file.filename || req.file.public_id || req.file.originalname;
    const fileUrl = req.file.path || req.file.secure_url || req.file.url || '';

    // If a document of same type already exists, update it instead of creating duplicate
    const existing = await DriverDocument.findOne({ driverId: req.params.id, docType: req.body.docType });
    if (existing) {
      existing.fileKey = fileKey;
      existing.fileUrl = fileUrl;
      existing.expiryDate = req.body.expiryDate || existing.expiryDate;
      existing.status = 'pending';
      await existing.save();
      return sendSuccess(res, existing, 'Document updated', 200);
    }

    const doc = await DriverDocument.create({
      driverId: req.params.id,
      docType: req.body.docType,
      fileKey: fileKey,
      fileUrl: fileUrl,
      expiryDate: req.body.expiryDate || null,
    });
    sendSuccess(res, doc, 'Document uploaded', 201);
  } catch (err) {
    sendError(res, err.message || 'Failed to upload document', 500);
  }
});

// PUT /api/drivers/:id/status — change status with reason
router.put('/:id/status', requirePermission('drivers.change_status'), validate(changeStatusValidation), async (req, res) => {
  const { status, reason } = req.body;

  const driver = await Driver.findById(req.params.id);
  if (!driver) return sendError(res, 'Driver not found', 404);

  const previousStatus = driver.status;
  driver.status = status;
  await driver.save();

  // Audit log
  await auditLogger.logChange('Driver', driver._id, 'status', previousStatus, status, req.user._id, 'status_change');

  // Create a ledger entry as a status log
  const { DriverLedger } = require('../models');
  await DriverLedger.create({
    driverId: driver._id,
    entryType: 'manual_debit',
    debit: 0,
    credit: 0,
    runningBalance: 0,
    description: `Status changed from ${previousStatus} to ${status}. Reason: ${reason || 'N/A'}`,
    createdBy: req.user._id,
  });

  sendSuccess(res, driver, 'Status updated');
});

module.exports = router;
