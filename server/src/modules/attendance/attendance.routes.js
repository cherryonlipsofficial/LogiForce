const express = require('express');
const router = express.Router();
const { protect, requirePermission, requireAnyPermission } = require('../../middleware/auth');
const { attendanceUpload } = require('../../middleware/upload');
const attendanceService = require('./attendance.service');
const {
  sendUploadNotification, approveAttendance, raiseDispute,
  respondToDispute,
} = require('./attendanceApproval.service');
const { generateInvoice } = require('../../services/invoiceGeneration.service');
const { runSalaryForBatch, getSalaryRunsByBatch } = require('../../services/salaryRun.service');
const { getModel } = require('../../config/modelRegistry');
const { sendSuccess, sendError, sendPaginated } = require('../../utils/responseHelper');
const { PAGINATION } = require('../../config/constants');
const validate = require('../../middleware/validate');
const { uploadAttendanceValidation, overrideRecordValidation } = require('./attendance.validators');

// All routes are protected
router.use(protect);

// GET /api/attendance/batches — list batches with filters
router.get('/batches', requirePermission('attendance.view'), async (req, res) => {
  const AttendanceBatch = getModel(req, 'AttendanceBatch');
  const page = parseInt(req.query.page) || PAGINATION.DEFAULT_PAGE;
  const limit = parseInt(req.query.limit) || PAGINATION.DEFAULT_LIMIT;
  const skip = (page - 1) * limit;

  const query = {};
  if (req.query.clientId) query.clientId = req.query.clientId;
  if (req.query.projectId) query.projectId = req.query.projectId;
  if (req.query.status) query.status = req.query.status;
  if (req.query.year) query['period.year'] = parseInt(req.query.year);
  if (req.query.month) query['period.month'] = parseInt(req.query.month);

  const [batches, total] = await Promise.all([
    AttendanceBatch.find(query)
      .populate('clientId', 'name')
      .populate('projectId', 'name projectCode')
      .populate('uploadedBy', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    AttendanceBatch.countDocuments(query),
  ]);

  sendPaginated(res, batches, total, page, limit);
});

// POST /api/attendance/upload — upload attendance file
router.post('/upload', requirePermission('attendance.upload'), attendanceUpload.single('file'), validate(uploadAttendanceValidation), async (req, res) => {
  if (!req.file) return sendError(res, 'No file uploaded', 400);

  const AttendanceBatch = getModel(req, 'AttendanceBatch');
  const AttendanceRecord = getModel(req, 'AttendanceRecord');
  const Project = getModel(req, 'Project');
  const { projectId, year, month, columnMapping } = req.body;

  // Look up project to derive clientId
  const project = await Project.findById(projectId).select('clientId').lean();
  if (!project) return sendError(res, 'Project not found', 404);
  const clientId = project.clientId;

  let mapping;
  try {
    mapping = typeof columnMapping === 'string' ? JSON.parse(columnMapping) : columnMapping;
  } catch {
    return sendError(res, 'Invalid columnMapping JSON', 400);
  }

  const period = { year: parseInt(year), month: parseInt(month) };

  // Check for existing batch for same project + period (to allow revised uploads)
  let version = 1;
  let previousBatchId = null;
  const existingBatch = await AttendanceBatch.findOne({
    projectId,
    'period.year': period.year,
    'period.month': period.month,
  }).sort({ version: -1 });

  if (existingBatch) {
    if (!['disputed', 'rejected'].includes(existingBatch.status)) {
      return sendError(
        res,
        'An attendance batch already exists for this project and period. Only disputed or rejected batches can be revised.',
        409
      );
    }
    version = existingBatch.version + 1;
    previousBatchId = existingBatch._id;

    // Mark the old batch as superseded
    existingBatch.status = 'rejected';
    await existingBatch.save();
  }

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
    projectId,
    period,
    version,
    previousBatchId,
    status: 'uploaded',
    totalRows: stats.total,
    matchedRows: stats.matched,
    warningRows: stats.warnings,
    errorRows: stats.errors,
    unmatchedRows: stats.unmatched,
    uploadedBy: req.user._id,
    uploadedByName: req.user.name,
    columnMapping: mapping,
    s3Key: req.file.originalname,
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
      projectId,
      period,
      workingDays: r.workingDays,
      overtimeHours: r.overtimeHours,
      totalOrders: r.totalOrders,
      rawEmployeeCode: r.employeeCode,
      status: r.status,
      issues: r.issues,
    }));

  if (records.length > 0) {
    await AttendanceRecord.insertMany(records);
  }

  // Send notifications to Sales and Ops for review
  await sendUploadNotification(batch._id, req.user._id);

  sendSuccess(res, { batch, stats }, 'Attendance file uploaded and processed', 201);
});

// GET /api/attendance/batches/:id — get batch with validation results
router.get('/batches/:id', requirePermission('attendance.view'), async (req, res) => {
  const AttendanceBatch = getModel(req, 'AttendanceBatch');
  const AttendanceRecord = getModel(req, 'AttendanceRecord');
  const batch = await AttendanceBatch.findById(req.params.id)
    .populate('clientId', 'name')
    .populate('projectId', 'name projectCode')
    .populate('uploadedBy', 'name')
    .populate('approvedBy', 'name')
    .lean();

  if (!batch) return sendError(res, 'Batch not found', 404);

  const records = await AttendanceRecord.find({ batchId: batch._id })
    .populate('driverId', 'fullName employeeCode clientUserId payStructure')
    .lean();

  sendSuccess(res, { batch, records });
});

// PUT /api/attendance/batches/:id/reject — reject batch
router.put('/batches/:id/reject', requirePermission('attendance.reject'), async (req, res) => {
  const AttendanceBatch = getModel(req, 'AttendanceBatch');
  const batch = await AttendanceBatch.findById(req.params.id);
  if (!batch) return sendError(res, 'Batch not found', 404);

  if (batch.status !== 'pending_approval') {
    return sendError(res, `Cannot reject batch in ${batch.status} status`, 400);
  }

  batch.status = 'rejected';
  batch.rejectedBy = req.user._id;
  batch.rejectedAt = new Date();
  await batch.save();

  sendSuccess(res, batch, 'Batch rejected');
});

// DELETE /api/attendance/batches/:id — delete batch and its records (admin only)
router.delete('/batches/:id', requirePermission('attendance.delete'), async (req, res) => {
  const AttendanceBatch = getModel(req, 'AttendanceBatch');
  const AttendanceRecord = getModel(req, 'AttendanceRecord');
  const batch = await AttendanceBatch.findById(req.params.id);
  if (!batch) return sendError(res, 'Batch not found', 404);

  if (['fully_approved', 'invoiced', 'processed'].includes(batch.status)) {
    return sendError(res, `Cannot delete batch in ${batch.status} status`, 400);
  }

  await AttendanceRecord.deleteMany({ batchId: batch._id });
  await AttendanceBatch.findByIdAndDelete(batch._id);

  sendSuccess(res, null, 'Batch deleted');
});

// PUT /api/attendance/records/:id/override — override a flagged record
router.put('/records/:id/override', requirePermission('attendance.override'), validate(overrideRecordValidation), async (req, res) => {
  const AttendanceRecord = getModel(req, 'AttendanceRecord');
  const { reason, workingDays, overtimeHours, totalOrders } = req.body;

  const record = await AttendanceRecord.findById(req.params.id);
  if (!record) return sendError(res, 'Attendance record not found', 404);

  record.status = 'overridden';
  record.overrideReason = reason;
  record.overrideBy = req.user._id;
  if (workingDays !== undefined) record.workingDays = workingDays;
  if (overtimeHours !== undefined) record.overtimeHours = overtimeHours;
  if (totalOrders !== undefined) record.totalOrders = totalOrders;
  await record.save();

  sendSuccess(res, record, 'Record overridden');
});

// POST /api/attendance/batches/:id/approve — Sales or Ops approves a batch
router.post('/batches/:id/approve', requireAnyPermission(['attendance.approve', 'attendance.approve_sales', 'attendance.approve_ops']), async (req, res) => {
  const result = await approveAttendance(
    req.params.id,
    req.user._id,
    req.body.notes
  );
  res.json({
    success: true,
    message: result.status === 'fully_approved'
      ? 'Attendance fully approved by both teams. Invoice can now be generated.'
      : `Attendance approved. Waiting for ${
          result.salesApproval.status !== 'approved' ? 'Sales' : 'Operations'
        } team approval.`,
    data: result,
  });
});

// POST /api/attendance/batches/:id/dispute — Sales or Ops raises a dispute
router.post('/batches/:id/dispute', requirePermission('attendance.dispute'), async (req, res) => {
  if (!req.body.reason || req.body.reason.length < 10) {
    return res.status(400).json({
      success: false,
      message: 'Dispute reason must be at least 10 characters',
    });
  }
  if (!req.body.disputeType) {
    return res.status(400).json({
      success: false,
      message: 'Dispute type is required',
    });
  }

  const result = await raiseDispute(
    req.params.id,
    req.user._id,
    req.body
  );
  res.json({
    success: true,
    message: 'Dispute raised. Accounts team has been notified.',
    data: result,
  });
});

// POST /api/attendance/disputes/:id/respond — Accounts responds to an open dispute
router.post('/disputes/:id/respond', requirePermission('attendance.respond_dispute'), async (req, res) => {
  if (!req.body.message || req.body.message.length < 10) {
    return res.status(400).json({
      success: false,
      message: 'Response message must be at least 10 characters',
    });
  }

  const result = await respondToDispute(
    req.params.id,
    req.user._id,
    req.body.message
  );
  res.json({
    success: true,
    message: 'Response submitted. Reviewer has been notified to re-check.',
    data: result,
  });
});

// GET /api/attendance/batches/:id/approvals — get batch with approval details
router.get('/batches/:id/approvals', requirePermission('attendance.view'), async (req, res) => {
  const AttendanceBatch = getModel(req, 'AttendanceBatch');
  const batch = await AttendanceBatch.findById(req.params.id)
    .populate('clientId', 'name')
    .populate('projectId', 'name projectCode')
    .populate('uploadedBy', 'name email')
    .populate('salesApproval.approvedBy', 'name')
    .populate('salesApproval.disputedBy', 'name')
    .populate('opsApproval.approvedBy', 'name')
    .populate('opsApproval.disputedBy', 'name')
    .populate('invoiceId')
    .populate({
      path: 'disputes',
      populate: [
        { path: 'raisedBy', select: 'name' },
        { path: 'response.respondedBy', select: 'name' },
      ],
    })
    .lean();
  if (!batch) return res.status(404).json({ message: 'Batch not found' });
  res.json({ success: true, data: batch });
});

// GET /api/attendance/batches/:id/disputes — list disputes for a batch
router.get('/batches/:id/disputes', requirePermission('attendance.view'), async (req, res) => {
  const AttendanceDispute = getModel(req, 'AttendanceDispute');
  const disputes = await AttendanceDispute.find({ batchId: req.params.id })
    .populate('raisedBy', 'name')
    .populate('response.respondedBy', 'name')
    .sort({ createdAt: -1 })
    .lean();
  res.json({ success: true, data: disputes });
});

// POST /api/attendance/batches/:id/generate-invoice — generate invoice from approved batch
router.post('/batches/:id/generate-invoice', requirePermission('invoices.generate'), async (req, res) => {
  const result = await generateInvoice(req.params.id, req.user._id);
  res.status(201).json({
    success: true,
    message: `Invoice ${result.invoice.invoiceNo} generated successfully`,
    data: result,
  });
});

// POST /api/attendance/batches/:id/run-salary — generate salary runs from approved batch
router.post('/batches/:id/run-salary', requirePermission('salary.run'), async (req, res) => {
  const result = await runSalaryForBatch(req.params.id, req.user._id);
  res.status(201).json({
    success: true,
    message: 'Salary runs processed.',
    data: result,
  });
});

// GET /api/attendance/batches/:id/salary-runs — list salary runs for a batch
router.get('/batches/:id/salary-runs', requirePermission('salary.view'), async (req, res) => {
  const runs = await getSalaryRunsByBatch(req.params.id);
  res.json({ success: true, data: runs });
});

// GET /api/attendance/:driverId/:year/:month — specific attendance record
// NOTE: This wildcard route must be defined AFTER all /batches/* routes
// to avoid intercepting them (e.g. /batches/:id/disputes).
router.get('/:driverId/:year/:month', requirePermission('attendance.view'), async (req, res) => {
  const AttendanceRecord = getModel(req, 'AttendanceRecord');
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

module.exports = router;
