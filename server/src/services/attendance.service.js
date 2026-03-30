const path = require('path');
const XLSX = require('xlsx');
const { Readable } = require('stream');
const csv = require('csv-parser');
const { Driver } = require('../models');

const parseAttendanceFile = async (file, columnMapping, clientId, period) => {
  const ext = path.extname(file.originalname).toLowerCase();
  let rawRows;

  if (ext === '.xlsx' || ext === '.xls') {
    rawRows = parseXlsx(file.buffer);
  } else if (ext === '.csv') {
    rawRows = await parseCsv(file.buffer);
  } else {
    const err = new Error('Unsupported file type. Use .xlsx, .xls, or .csv');
    err.statusCode = 400;
    throw err;
  }

  // Map columns using provided mapping
  const mappedRows = rawRows.map((row) => ({
    employeeCode: (row[columnMapping.employeeCode] || '').toString().trim(),
    driverName: row[columnMapping.driverName] || '',
    workingDays: parseFloat(row[columnMapping.workingDays]) || 0,
    overtimeHours: parseFloat(row[columnMapping.overtimeHours]) || 0,
    totalOrders: parseFloat(row[columnMapping.totalOrders]) || 0,
  }));

  // Process each row: match drivers, validate
  const stats = { total: mappedRows.length, matched: 0, warnings: 0, errors: 0, unmatched: 0 };
  const rows = [];

  for (const mapped of mappedRows) {
    const result = { ...mapped, issues: [], status: 'valid', driverId: null };

    // Find driver by employeeCode (case-insensitive to handle file variations)
    const driver = await Driver.findOne({
      employeeCode: { $regex: new RegExp(`^${mapped.employeeCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
    });

    if (!driver) {
      result.issues.push('driver_not_found');
      result.status = 'error';
      stats.unmatched++;
      stats.errors++;
      rows.push(result);
      continue;
    }

    result.driverId = driver._id;
    stats.matched++;

    // Validate
    const issues = validateAttendanceRow(mapped, driver);
    result.issues = issues;

    if (issues.length > 0) {
      const hasError = issues.some((i) => i === 'driver_not_found');
      result.status = hasError ? 'error' : 'warning';
      if (hasError) {
        stats.errors++;
      } else {
        stats.warnings++;
      }
    }

    rows.push(result);
  }

  return { rows, stats };
};

const parseXlsx = (buffer) => {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  return XLSX.utils.sheet_to_json(sheet);
};

const parseCsv = (buffer) => {
  return new Promise((resolve, reject) => {
    const results = [];
    Readable.from(buffer)
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', () => resolve(results))
      .on('error', (err) => reject(err));
  });
};

const validateAttendanceRow = (row, driver) => {
  const issues = [];

  const days = parseFloat(row.workingDays);
  if (isNaN(days) || days < 0 || days > 31) {
    issues.push('invalid_working_days');
  }

  if (days === 0) {
    issues.push('zero_days');
  }

  if (days > 26) {
    issues.push('over_limit');
  }

  if (row.overtimeHours > 0 && !row.overtimeHours) {
    issues.push('missing_ot');
  }

  if (driver) {
    if (driver.status !== 'active') {
      issues.push('driver_not_active');
    }

    if (driver.visaExpiry && new Date(driver.visaExpiry) < new Date()) {
      issues.push('visa_expired');
    }
  }

  return issues;
};

module.exports = {
  parseAttendanceFile,
  validateAttendanceRow,
};
