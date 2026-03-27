const express = require('express');
const path = require('path');
const router = express.Router();
const { protect, requirePermission } = require('../middleware/auth');
const upload = require('../middleware/upload');
const driverService = require('../services/driver.service');
const { verifyContacts, setClientUserId, activateDriver, changeStatusManual, getDriverStatusSummary } = require('../services/driverWorkflow.service');
const { getHistory } = require('../services/driverHistory.service');
const { getDriverVehicleHistory } = require('../services/vehicleAssignment.service');
const { Driver, DriverDocument, SalaryRun } = require('../models');
const { sendSuccess, sendError, sendPaginated } = require('../utils/responseHelper');
const validate = require('../middleware/validate');
const { createDriverValidation, updateDriverValidation, changeStatusValidation } = require('../middleware/validators/driver.validators');
const auditLogger = require('../utils/auditLogger');
const { evaluateAndTransition } = require('../services/driverStatusEngine.service');
const { logEvent } = require('../services/driverHistory.service');

// All routes are protected
router.use(protect);

// GET /api/drivers/expiring-documents — must be before /:id routes
router.get('/expiring-documents', async (req, res) => {
  const days = parseInt(req.query.days) || 30;
  const docs = await driverService.getExpiringDocuments(days);
  sendSuccess(res, docs);
});

// GET /api/drivers/uploads/:fileKey — serve file from MongoDB
router.get('/uploads/:fileKey', async (req, res) => {
  try {
    const doc = await DriverDocument.findOne({ fileKey: req.params.fileKey });
    if (!doc || !doc.fileData) {
      return sendError(res, 'File not found', 404);
    }
    res.set('Content-Type', doc.contentType || 'application/octet-stream');
    res.set('Content-Disposition', `inline; filename="${doc.originalName || doc.fileKey}"`);
    res.send(doc.fileData);
  } catch (err) {
    sendError(res, err.message || 'Failed to retrieve file', 500);
  }
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

  const headers = ['Employee Code', 'Full Name', 'Nationality', 'Phone UAE', 'Project', 'Status', 'Pay Structure', 'Base Salary', 'Join Date', 'Emirates ID'];
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
// Use memory storage to parse the file locally
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
      const sheet = workbook.Sheets[sheetName];
      // Convert numeric cells to strings so large numbers (phone, visa)
      // don't get truncated to scientific notation like 9.72E+11
      Object.values(sheet).forEach(cell => {
        if (cell && cell.t === 'n') {
          cell.t = 's';
          cell.v = String(cell.v);
          cell.w = cell.v;
        }
      });
      // Use header:1 to get raw arrays, then manually map headers below
      // This avoids issues where sheet_to_json misidentifies headers
      const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
      if (rawRows.length > 1) {
        const headerRow = rawRows[0];
        for (let r = 1; r < rawRows.length; r++) {
          const obj = {};
          headerRow.forEach((h, i) => { obj[String(h)] = rawRows[r][i] ?? ''; });
          rows.push(obj);
        }
      }
    } else {
      return sendError(res, 'Unsupported file format. Use .csv or .xlsx', 400);
    }

    // Normalize row keys: strip BOM, invisible chars, trim whitespace,
    // and map common header variations to expected camelCase keys
    const KEY_MAP = {
      fullname: 'fullName', full_name: 'fullName', 'full name': 'fullName',
      nationality: 'nationality',
      phoneuae: 'phoneUae', phone_uae: 'phoneUae', 'phone uae': 'phoneUae', 'uae phone': 'phoneUae',
      emiratesid: 'emiratesId', emirates_id: 'emiratesId', 'emirates id': 'emiratesId',
      project: 'project',
      paystructure: 'payStructure', pay_structure: 'payStructure', 'pay structure': 'payStructure',
      basesalary: 'baseSalary', base_salary: 'baseSalary', 'base salary': 'baseSalary',
      joindate: 'joinDate', join_date: 'joinDate', 'join date': 'joinDate',
      joiningdate: 'joinDate', joining_date: 'joinDate', 'joining date': 'joinDate',
      passportnumber: 'passportNumber', passport_number: 'passportNumber', 'passport number': 'passportNumber',
      visanumber: 'visaNumber', visa_number: 'visaNumber', 'visa number': 'visaNumber',
      bankname: 'bankName', bank_name: 'bankName', 'bank name': 'bankName',
      iban: 'iban',
      employeecode: 'employeeCode', employee_code: 'employeeCode', 'employee code': 'employeeCode',
      passportexpiry: 'passportExpiry', passport_expiry: 'passportExpiry', 'passport expiry': 'passportExpiry',
      dateofbirth: 'dateOfBirth', date_of_birth: 'dateOfBirth', 'date of birth': 'dateOfBirth',
      email: 'email',
      homecountryphone: 'homeCountryPhone', home_country_phone: 'homeCountryPhone', 'home country phone': 'homeCountryPhone',
      emergencycontactname: 'emergencyContactName', emergency_contact_name: 'emergencyContactName', 'emergency contact name': 'emergencyContactName',
      emergencycontactphone: 'emergencyContactPhone', emergency_contact_phone: 'emergencyContactPhone', 'emergency contact phone': 'emergencyContactPhone',
      emergencycontactrelation: 'emergencyContactRelation', emergency_contact_relation: 'emergencyContactRelation', 'emergency contact relation': 'emergencyContactRelation',
      clientname: 'clientName', client_name: 'clientName', 'client name': 'clientName',
    };
    rows = rows.map(row => {
      const normalized = {};
      for (const [key, value] of Object.entries(row)) {
        // Strip BOM, zero-width chars, trim whitespace, lowercase for lookup
        const clean = String(key).replace(/[\uFEFF\u200B\u00A0]/g, '').trim().toLowerCase();
        const mapped = KEY_MAP[clean] || String(key).replace(/[\uFEFF\u200B\u00A0]/g, '').trim();
        normalized[mapped] = value;
      }
      return normalized;
    });

    // Filter out completely empty rows (all values blank)
    rows = rows.filter(row => Object.values(row).some(v => v !== undefined && v !== null && String(v).trim() !== ''));

    if (rows.length === 0) return sendError(res, 'File is empty or has no data rows', 400);
    if (rows.length > 500) return sendError(res, 'Maximum 500 rows per import', 400);

    const result = await driverService.bulkCreate(rows, req.user._id);
    sendSuccess(res, result, `Imported ${result.created} drivers${result.errors.length > 0 ? ` with ${result.errors.length} errors` : ''}`, 201);
  } catch (err) {
    console.error('[BulkImport Error]', err);
    return sendError(res, `Failed to process file: ${err.message}`, 400);
  }
});

// GET /api/drivers/bulk-import/template — download XLSX template
router.get('/bulk-import/template', async (req, res) => {
  const XLSX = require('xlsx');
  const headers = ['employeeCode', 'fullName', 'nationality', 'phoneUae', 'emiratesId', 'passportNumber', 'passportExpiry', 'dateOfBirth', 'email', 'bankName', 'iban', 'homeCountryPhone', 'emergencyContactName', 'emergencyContactPhone', 'emergencyContactRelation', 'joinDate', 'baseSalary', 'payStructure', 'clientName', 'project'];

  const ws = XLSX.utils.aoa_to_sheet([headers]);

  // Set phone, visa, emirates ID, passport, IBAN columns to text format (@)
  // so Excel doesn't convert large numbers to scientific notation
  const textColumns = ['phoneUae', 'emiratesId', 'passportNumber', 'iban', 'homeCountryPhone', 'emergencyContactPhone'];
  const textColIndices = textColumns.map(h => headers.indexOf(h)).filter(i => i !== -1);
  const range = XLSX.utils.decode_range(ws['!ref']);
  for (const colIdx of textColIndices) {
    for (let row = range.s.r; row <= range.e.r; row++) {
      const cellRef = XLSX.utils.encode_cell({ r: row, c: colIdx });
      if (ws[cellRef]) {
        ws[cellRef].t = 's';
        ws[cellRef].z = '@';
      }
    }
    // Set column width for readability
    if (!ws['!cols']) ws['!cols'] = [];
    ws['!cols'][colIdx] = { wch: 20 };
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Drivers');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=drivers-import-template.xlsx');
  res.send(buf);
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

// PUT /api/drivers/:id — update driver details
router.put('/:id', requirePermission('drivers.edit'), validate(updateDriverValidation), async (req, res) => {
  const isAdmin = req.userPermissions?.includes('*') ||
    (req.user.roleId?.isSystemRole === true && req.user.roleId?.name === 'admin');
  const canEditActive = req.userPermissions?.includes('drivers.edit_active');
  const driver = await driverService.update(req.params.id, req.body, req.user._id, { isAdmin, canEditActive });
  sendSuccess(res, driver, 'Driver updated');
});

// DELETE /api/drivers/:id — soft delete (admin only)
router.delete('/:id', requirePermission('drivers.delete'), async (req, res) => {
  const driver = await driverService.softDelete(req.params.id, req.user._id);
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
    .select('-fileData')
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

    const fileKey = Date.now() + '-' + Math.round(Math.random() * 1e9) + '-' + req.file.originalname;
    const fileFields = {
      fileKey,
      originalName: req.file.originalname,
      contentType: req.file.mimetype,
      fileData: req.file.buffer,
      fileSize: req.file.size,
    };

    // If a document of same type already exists, update it instead of creating duplicate
    const existing = await DriverDocument.findOne({ driverId: req.params.id, docType: req.body.docType });
    if (existing) {
      Object.assign(existing, fileFields);
      existing.expiryDate = req.body.expiryDate || existing.expiryDate;
      existing.status = 'pending';
      await existing.save();

      await logEvent(req.params.id, 'document_uploaded', {
        documentType: req.body.docType,
        description: `${req.body.docType.replace(/_/g, ' ')} uploaded`,
      }, req.user._id);
      await evaluateAndTransition(req.params.id, req.user._id);

      return sendSuccess(res, existing, 'Document updated', 200);
    }

    const doc = await DriverDocument.create({
      driverId: req.params.id,
      docType: req.body.docType,
      ...fileFields,
      expiryDate: req.body.expiryDate || null,
    });

    await logEvent(req.params.id, 'document_uploaded', {
      documentType: req.body.docType,
      description: `${req.body.docType.replace(/_/g, ' ')} uploaded`,
    }, req.user._id);
    await evaluateAndTransition(req.params.id, req.user._id);

    sendSuccess(res, doc, 'Document uploaded', 201);
  } catch (err) {
    sendError(res, err.message || 'Failed to upload document', 500);
  }
});

// POST /api/drivers/:id/verify-contacts — Compliance verifies contact details
router.post('/:id/verify-contacts', requirePermission('drivers.change_status'), async (req, res) => {
  try {
    const driver = await verifyContacts(req.params.id, req.user._id);
    sendSuccess(res, driver, `Contacts verified. Current status: ${driver.status}`);
  } catch (err) {
    sendError(res, err.message, err.statusCode || 500);
  }
});

// PUT /api/drivers/:id/client-user-id — Operations sets client user ID (only when Active)
// Requires drivers.update_client_id permission (admin has all permissions via '*')
router.put('/:id/client-user-id', requirePermission('drivers.update_client_id'), async (req, res) => {
  try {
    const { clientUserId } = req.body;
    if (!clientUserId || typeof clientUserId !== 'string' || !clientUserId.trim()) {
      return sendError(res, 'clientUserId is required and must be a non-empty string', 400);
    }
    const driver = await setClientUserId(req.params.id, clientUserId, req.user._id);
    sendSuccess(res, driver, `Client user ID set. Current status: ${driver.status}`);
  } catch (err) {
    sendError(res, err.message, err.statusCode || 500);
  }
});

// POST /api/drivers/:id/activate — Activate driver from pending_verification
router.post('/:id/activate', requirePermission('drivers.activate'), async (req, res) => {
  try {
    const driver = await activateDriver(req.params.id, req.user._id);
    sendSuccess(res, driver, `Driver activated. Current status: ${driver.status}`);
  } catch (err) {
    sendError(res, err.message, err.statusCode || 500);
  }
});

// PUT /api/drivers/:id/status — manual status change (Operations / Admin)
router.put('/:id/status', requirePermission('drivers.change_status'), validate(changeStatusValidation), async (req, res) => {
  try {
    const { status, reason } = req.body;
    const driver = await changeStatusManual(req.params.id, status, reason, req.user._id);
    sendSuccess(res, driver, 'Status updated');
  } catch (err) {
    sendError(res, err.message, err.statusCode || 500);
  }
});

// GET /api/drivers/:id/status-summary — get status summary for frontend
router.get('/:id/status-summary', requirePermission('drivers.view'), async (req, res) => {
  try {
    const summary = await getDriverStatusSummary(req.params.id);
    sendSuccess(res, summary);
  } catch (err) {
    sendError(res, err.message, err.statusCode || 500);
  }
});

// GET /api/drivers/:id/history — get driver event history
router.get('/:id/history', requirePermission('drivers.view'), async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 30;
    const result = await getHistory(req.params.id, page, limit);
    sendSuccess(res, result);
  } catch (err) {
    sendError(res, err.message, err.statusCode || 500);
  }
});

// GET /api/drivers/:id/vehicle-history — vehicle assignment history for a driver
router.get('/:id/vehicle-history', requirePermission('drivers.view'), async (req, res) => {
  try {
    const result = await getDriverVehicleHistory(
      req.params.id,
      parseInt(req.query.page) || 1,
      parseInt(req.query.limit) || 20
    );
    sendSuccess(res, result);
  } catch (err) {
    sendError(res, err.message, err.statusCode || 500);
  }
});

// GET /api/drivers/:id/current-vehicle — currently assigned vehicle for a driver
router.get('/:id/current-vehicle', requirePermission('drivers.view'), async (req, res) => {
  try {
    const driver = await Driver.findById(req.params.id)
      .select('currentVehicleId currentVehicleAssignmentId')
      .populate('currentVehicleId');

    if (!driver) {
      return sendError(res, 'Driver not found', 404);
    }

    sendSuccess(res, {
      vehicle: driver.currentVehicleId || null,
      assignment: driver.currentVehicleAssignmentId || null,
    });
  } catch (err) {
    sendError(res, err.message, err.statusCode || 500);
  }
});

module.exports = router;
