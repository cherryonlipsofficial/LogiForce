const express = require('express');
const router = express.Router();
const { protect, restrictTo } = require('../middleware/auth');
const upload = require('../middleware/upload');
const attendanceService = require('../services/attendance.service');
const { AttendanceBatch, AttendanceRecord } = require('../models');
const { sendSuccess, sendError, sendPaginated } = require('../utils/responseHelper');
const { PAGINATION } = require('../config/constants');
const validate = require('../middleware/validate');
const { uploadAttendanceValidation, overrideRecordValidation } = require('../middleware/validators/attendance.validators');

// All routes are protected
router.use(protect);

// GET /api/attendance/batches — list batches with filters
router.get('/batches', async (req, res) => {
  const page = parseInt(req.query.page) || PAGINATION.DEFAULT_PAGE;
  const limit = parseInt(req.query.limit) || PAGINATION.DEFAULT_LIMIT;
  const skip = (page - 1) * limit;

  const query = {};
  if (req.query.clientId) query.clientId = req.query.clientId;
  if (req.query.status) query.status = req.query.status;
  if (req.query.year) query['period.year'] = parseInt(req.query.year);
  if (req.query.month) query['period.month'] = parseInt(req.query.month);

  const [batches, total] = await Promise.all([
    AttendanceBatch.find(query)
      .populate('clientId', 'name')
      .populate('uploadedBy', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    AttendanceBatch.countDocuments(query),
  ]);

  sendPaginated(res, batches, total, page, limit);
});

// POST /api/attendance/upload — upload attendance file
router.post('/upload', restrictTo('ops', 'admin'), upload.single('file'), validate(uploadAttendanceValidation), async (req, res) => {
  if (!req.file) return sendError(res, 'No file uploaded', 400);

  const { clientId, year, month, columnMapping } = req.body;

  let mapping;
  try {
    mapping = typeof columnMapping === 'string' ? JSON.parse(columnMapping) : columnMapping;
  } catch {
    return sendError(res, 'Invalid columnMapping JSON', 400);
  }

  const period = { year: parseInt(year), month: parseInt(month) };

  // Parse and validate file
  const { rows, stats } = await attendanceService.parseAttendanceFile(
    req.file,
    mapping,
    clientId,
    period
  );

  // Create batch record
  const batch = await AttendanceBatch.create({
    clientId,
    period,
    status: 'pending_approval',
    totalRows: stats.total,
    matchedRows: stats.matched,
    warningRows: stats.warnings,
    errorRows: stats.errors,
    unmatchedRows: stats.unmatched,
    uploadedBy: req.user._id,
    columnMapping: mapping,
    s3Key: req.file.filename,
    validationErrors: rows
      .filter((r) => r.issues.length > 0)
      .map((r) => ({
        driverId: r.driverId,
        employeeCode: r.employeeCode,
        issue: r.issues[0],
        details: r.issues.join(', '),
      })),
  });

  // Create attendance records for matched rows
  const records = rows
    .filter((r) => r.driverId)
    .map((r) => ({
      batchId: batch._id,
      driverId: r.driverId,
      clientId,
      period,
      workingDays: r.workingDays,
      overtimeHours: r.overtimeHours,
      rawEmployeeCode: r.employeeCode,
      status: r.status,
      issues: r.issues,
    }));

  if (records.length > 0) {
    await AttendanceRecord.insertMany(records);
  }

  sendSuccess(res, { batch, stats }, 'Attendance file uploaded and processed', 201);
});

// GET /api/attendance/batches/:id — get batch with validation results
router.get('/batches/:id', async (req, res) => {
  const batch = await AttendanceBatch.findById(req.params.id)
    .populate('clientId', 'name')
    .populate('uploadedBy', 'name')
    .populate('approvedBy', 'name');

  if (!batch) return sendError(res, 'Batch not found', 404);

  const records = await AttendanceRecord.find({ batchId: batch._id })
    .populate('driverId', 'fullName employeeCode');

  sendSuccess(res, { batch, records });
});

// PUT /api/attendance/batches/:id/approve — approve batch
router.put('/batches/:id/approve', restrictTo('admin', 'accountant'), async (req, res) => {
  const batch = await AttendanceBatch.findById(req.params.id);
  if (!batch) return sendError(res, 'Batch not found', 404);

  if (batch.status !== 'pending_approval') {
    return sendError(res, `Cannot approve batch in ${batch.status} status`, 400);
  }

  batch.status = 'approved';
  batch.approvedBy = req.user._id;
  batch.approvedAt = new Date();
  await batch.save();

  sendSuccess(res, batch, 'Batch approved');
});

// PUT /api/attendance/batches/:id/reject — reject batch
router.put('/batches/:id/reject', restrictTo('admin', 'accountant'), async (req, res) => {
  const batch = await AttendanceBatch.findById(req.params.id);
  if (!batch) return sendError(res, 'Batch not found', 404);

  if (batch.status !== 'pending_approval') {
    return sendError(res, `Cannot reject batch in ${batch.status} status`, 400);
  }

  batch.status = 'rejected';
  await batch.save();

  sendSuccess(res, batch, 'Batch rejected');
});

// DELETE /api/attendance/batches/:id — delete batch and its records (admin only)
router.delete('/batches/:id', restrictTo('admin'), async (req, res) => {
  const batch = await AttendanceBatch.findById(req.params.id);
  if (!batch) return sendError(res, 'Batch not found', 404);

  if (batch.status === 'approved' || batch.status === 'processed') {
    return sendError(res, `Cannot delete batch in ${batch.status} status`, 400);
  }

  await AttendanceRecord.deleteMany({ batchId: batch._id });
  await AttendanceBatch.findByIdAndDelete(batch._id);

  sendSuccess(res, null, 'Batch deleted');
});

// GET /api/attendance/:driverId/:year/:month — specific attendance record
router.get('/:driverId/:year/:month', async (req, res) => {
  const { driverId, year, month } = req.params;

  const record = await AttendanceRecord.findOne({
    driverId,
    'period.year': parseInt(year),
    'period.month': parseInt(month),
  })
    .populate('driverId', 'fullName employeeCode')
    .populate('batchId', 'batchId status');

  if (!record) return sendError(res, 'Attendance record not found', 404);
  sendSuccess(res, record);
});

// PUT /api/attendance/records/:id/override — override a flagged record
router.put('/records/:id/override', restrictTo('admin', 'accountant'), validate(overrideRecordValidation), async (req, res) => {
  const { reason, workingDays, overtimeHours } = req.body;

  const record = await AttendanceRecord.findById(req.params.id);
  if (!record) return sendError(res, 'Attendance record not found', 404);

  record.status = 'overridden';
  record.overrideReason = reason;
  record.overrideBy = req.user._id;
  if (workingDays !== undefined) record.workingDays = workingDays;
  if (overtimeHours !== undefined) record.overtimeHours = overtimeHours;
  await record.save();

  sendSuccess(res, record, 'Record overridden');
});

module.exports = router;
