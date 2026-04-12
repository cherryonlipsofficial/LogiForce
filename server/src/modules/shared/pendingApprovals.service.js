const { getModel } = require('../../config/modelRegistry');

/**
 * Returns a summary of all pending approvals relevant to the current user,
 * based on their role and permissions.
 */
async function getPendingApprovalsSummary(req, user) {
  const AttendanceBatch = getModel(req, 'AttendanceBatch');
  const SalaryRun = getModel(req, 'SalaryRun');
  const DriverAdvance = getModel(req, 'DriverAdvance');
  const GuaranteePassport = getModel(req, 'GuaranteePassport');
  const permissions = await user.getPermissions();
  const permSet = new Set(permissions);
  const isSystemAdmin = user.roleId?.isSystemRole === true;

  const summary = {
    attendance: 0,
    attendanceDisputes: 0,
    salary: 0,
    advances: 0,
    guaranteeExtensions: 0,
    total: 0,
    items: [],
  };

  // Run all counts in parallel
  const promises = [];

  // 1. Attendance approvals — check specific attendance approve permissions
  if (isSystemAdmin || permSet.has('attendance.approve_sales') || permSet.has('attendance.approve_ops')) {
    let attendanceFilter;

    if (permSet.has('attendance.approve_sales') && !permSet.has('attendance.approve_ops') && !isSystemAdmin) {
      // User can only do sales approval
      attendanceFilter = {
        status: { $in: ['pending_review', 'ops_approved', 'dispute_responded'] },
        'salesApproval.status': { $ne: 'approved' },
      };
    } else if (permSet.has('attendance.approve_ops') && !permSet.has('attendance.approve_sales') && !isSystemAdmin) {
      // User can only do ops approval
      attendanceFilter = {
        status: { $in: ['pending_review', 'sales_approved', 'dispute_responded'] },
        'opsApproval.status': { $ne: 'approved' },
      };
    } else {
      // Admin or user with both permissions
      attendanceFilter = {
        status: { $in: ['pending_review', 'sales_approved', 'ops_approved', 'dispute_responded'] },
      };
    }

    promises.push(
      AttendanceBatch.countDocuments(attendanceFilter).then(count => {
        summary.attendance = count;
      })
    );
  }

  // 1b. Disputed attendance batches — for users who can respond to disputes
  if (isSystemAdmin || permSet.has('attendance.respond_dispute')) {
    promises.push(
      AttendanceBatch.countDocuments({ status: 'disputed' }).then(count => {
        summary.attendanceDisputes = count;
      })
    );
  }

  // 2. Salary run approvals — check specific salary approve permissions
  if (isSystemAdmin || permSet.has('salary.approve_ops') || permSet.has('salary.approve_compliance') || permSet.has('salary.approve_accounts')) {
    let salaryFilter;

    if (permSet.has('salary.approve_ops') && !permSet.has('salary.approve_compliance') && !permSet.has('salary.approve_accounts') && !isSystemAdmin) {
      salaryFilter = { status: 'draft', isDeleted: { $ne: true } };
    } else if (permSet.has('salary.approve_compliance') && !permSet.has('salary.approve_ops') && !permSet.has('salary.approve_accounts') && !isSystemAdmin) {
      salaryFilter = { status: 'ops_approved', isDeleted: { $ne: true } };
    } else if (permSet.has('salary.approve_accounts') && !permSet.has('salary.approve_ops') && !permSet.has('salary.approve_compliance') && !isSystemAdmin) {
      salaryFilter = { status: 'compliance_approved', isDeleted: { $ne: true } };
    } else {
      // Admin or user with multiple permissions — show all pending at any stage
      salaryFilter = {
        status: { $in: ['draft', 'ops_approved', 'compliance_approved'] },
        isDeleted: { $ne: true },
      };
    }

    promises.push(
      SalaryRun.countDocuments(salaryFilter).then(count => {
        summary.salary = count;
      })
    );
  }

  // 3. Advance approvals — for users with advances.approve permission
  if (isSystemAdmin || permSet.has('advances.approve')) {
    promises.push(
      DriverAdvance.countDocuments({ status: 'pending' }).then(count => {
        summary.advances = count;
      })
    );
  }

  // 4. Guarantee extension approvals — for admins / roles.manage
  if (isSystemAdmin || permSet.has('roles.manage')) {
    promises.push(
      GuaranteePassport.countDocuments({ 'extensionRequest.status': 'pending' }).then(count => {
        summary.guaranteeExtensions = count;
      })
    );
  }

  await Promise.all(promises);

  // Build items array for frontend display
  if (summary.attendance > 0) {
    summary.items.push({
      type: 'attendance',
      label: 'Attendance batches',
      count: summary.attendance,
      path: '/attendance',
    });
  }
  if (summary.attendanceDisputes > 0) {
    summary.items.push({
      type: 'attendanceDisputes',
      label: 'Attendance disputes',
      count: summary.attendanceDisputes,
      path: '/attendance',
    });
  }
  if (summary.salary > 0) {
    summary.items.push({
      type: 'salary',
      label: 'Salary runs',
      count: summary.salary,
      path: '/salary',
    });
  }
  if (summary.advances > 0) {
    summary.items.push({
      type: 'advances',
      label: 'Advance requests',
      count: summary.advances,
      path: '/advances',
    });
  }
  if (summary.guaranteeExtensions > 0) {
    summary.items.push({
      type: 'guaranteeExtensions',
      label: 'Guarantee extensions',
      count: summary.guaranteeExtensions,
      path: '/guarantee-extensions',
    });
  }

  summary.total = summary.attendance + summary.attendanceDisputes + summary.salary + summary.advances + summary.guaranteeExtensions;

  return summary;
}

module.exports = { getPendingApprovalsSummary };
