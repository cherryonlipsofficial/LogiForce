const { AttendanceBatch, SalaryRun, DriverAdvance, GuaranteePassport, User } = require('../models');

/**
 * Returns a summary of all pending approvals relevant to the current user,
 * based on their role and permissions.
 */
async function getPendingApprovalsSummary(user) {
  const roleName = user.roleId?.name?.toLowerCase();
  const permissions = await user.getPermissions();
  const permSet = new Set(permissions);
  const isAdmin = user.roleId?.isSystemRole && roleName === 'admin';

  const summary = {
    attendance: 0,
    salary: 0,
    advances: 0,
    guaranteeExtensions: 0,
    total: 0,
    items: [],
  };

  // Run all counts in parallel
  const promises = [];

  // 1. Attendance approvals — for users with attendance.approve permission
  if (isAdmin || permSet.has('attendance.approve')) {
    const isSales = roleName === 'sales';
    const isOps = roleName === 'ops' || roleName === 'operations';

    let attendanceFilter;
    if (isSales) {
      // Sales sees batches where sales hasn't approved yet
      attendanceFilter = {
        status: { $in: ['pending_review', 'ops_approved', 'dispute_responded'] },
        'salesApproval.status': { $ne: 'approved' },
      };
    } else if (isOps) {
      // Ops sees batches where ops hasn't approved yet
      attendanceFilter = {
        status: { $in: ['pending_review', 'sales_approved', 'dispute_responded'] },
        'opsApproval.status': { $ne: 'approved' },
      };
    } else {
      // Admin or other roles with permission — show all needing any approval
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

  // 2. Salary run approvals — for users with salary.approve permission
  if (isAdmin || permSet.has('salary.approve')) {
    let salaryFilter;
    if (roleName === 'ops' || roleName === 'operations') {
      salaryFilter = { status: 'pending_approval', isDeleted: { $ne: true } };
    } else if (roleName === 'compliance') {
      salaryFilter = { status: 'ops_approved', isDeleted: { $ne: true } };
    } else if (roleName === 'accounts') {
      salaryFilter = { status: 'compliance_approved', isDeleted: { $ne: true } };
    } else {
      // Admin or other — show all pending at any stage
      salaryFilter = {
        status: { $in: ['pending_approval', 'ops_approved', 'compliance_approved'] },
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
  if (isAdmin || permSet.has('advances.approve')) {
    promises.push(
      DriverAdvance.countDocuments({ status: 'pending' }).then(count => {
        summary.advances = count;
      })
    );
  }

  // 4. Guarantee extension approvals — for admins / roles.manage
  if (isAdmin || permSet.has('roles.manage')) {
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

  summary.total = summary.attendance + summary.salary + summary.advances + summary.guaranteeExtensions;

  return summary;
}

module.exports = { getPendingApprovalsSummary };
