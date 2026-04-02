const { getModel } = require('../config/modelRegistry');
const { notifyByPermission, notifyUsers } = require('./notification.service');

function getMonthName(year, month) {
  return new Date(year, month - 1).toLocaleString('en', { month: 'long' });
}

async function sendUploadNotification(req, batchId, uploadedByUserId) {
  const AttendanceBatch = getModel(req, 'AttendanceBatch');

  const batch = await AttendanceBatch.findById(batchId)
    .populate('projectId', 'name projectCode')
    .populate('clientId', 'name');

  const monthName = getMonthName(batch.period.year, batch.period.month);
  const projectLabel = `${batch.projectId.name} (${batch.clientId.name})`;

  const count1 = await notifyByPermission('attendance.approve_sales', {
    type: 'attendance_uploaded',
    title: 'Attendance uploaded — review required',
    message: `Attendance for ${projectLabel} — ${monthName} ${batch.period.year} has been uploaded and needs your review. Please approve or raise a dispute.`,
    referenceModel: 'AttendanceBatch',
    referenceId: batchId,
    triggeredBy: uploadedByUserId,
    triggeredByName: batch.uploadedByName,
  });
  const count2 = await notifyByPermission('attendance.approve_ops', {
    type: 'attendance_uploaded',
    title: 'Attendance uploaded — review required',
    message: `Attendance for ${projectLabel} — ${monthName} ${batch.period.year} has been uploaded and needs your review. Please approve or raise a dispute.`,
    referenceModel: 'AttendanceBatch',
    referenceId: batchId,
    triggeredBy: uploadedByUserId,
    triggeredByName: batch.uploadedByName,
  });
  const count = count1 + count2;

  batch.status = 'pending_review';
  batch.notificationSentAt = new Date();
  await batch.save();

  return { notifiedCount: count };
}

async function approveAttendance(req, batchId, userId, notes) {
  const AttendanceBatch = getModel(req, 'AttendanceBatch');
  const User = getModel(req, 'User');

  const [user, batch] = await Promise.all([
    User.findById(userId).populate('roleId', 'name displayName'),
    AttendanceBatch.findById(batchId)
      .populate('projectId', 'name')
      .populate('clientId', 'name'),
  ]);

  if (!batch) throw Object.assign(new Error('Batch not found'), { statusCode: 404 });

  const allowedStatuses = [
    'pending_review', 'sales_approved', 'ops_approved', 'dispute_responded',
  ];
  if (!allowedStatuses.includes(batch.status)) {
    throw Object.assign(
      new Error(`Cannot approve a batch with status "${batch.status}"`),
      { statusCode: 400 }
    );
  }

  const userPerms = await user.getPermissions();
  const permSet = new Set(userPerms);
  const canApproveSales = permSet.has('attendance.approve_sales');
  const canApproveOps = permSet.has('attendance.approve_ops');
  const isSystemAdmin = user.roleId?.isSystemRole === true;

  if (!canApproveSales && !canApproveOps && !isSystemAdmin) {
    throw Object.assign(
      new Error('You do not have attendance approval permission'),
      { statusCode: 403 }
    );
  }

  // Determine the approval side:
  // - If user has sales permission (and sales not yet approved), do sales
  // - If user has ops permission (and ops not yet approved), do ops
  // - Admin: approve whichever side still needs it (sales first)
  const salesNeeded = batch.salesApproval?.status !== 'approved';
  const opsNeeded = batch.opsApproval?.status !== 'approved';

  let doSalesApproval;
  if (isSystemAdmin) {
    doSalesApproval = salesNeeded;
  } else if (canApproveSales && salesNeeded) {
    doSalesApproval = true;
  } else if (canApproveOps && opsNeeded) {
    doSalesApproval = false;
  } else {
    doSalesApproval = canApproveSales;
  }

  if (doSalesApproval) {
    if (batch.salesApproval.status === 'approved') {
      throw Object.assign(
        new Error('Sales team has already approved this batch'),
        { statusCode: 400 }
      );
    }
    batch.salesApproval = {
      status: 'approved',
      approvedBy: userId,
      approvedByName: user.name,
      approvedAt: new Date(),
      notes,
    };
  } else {
    if (batch.opsApproval.status === 'approved') {
      throw Object.assign(
        new Error('Operations team has already approved this batch'),
        { statusCode: 400 }
      );
    }
    batch.opsApproval = {
      status: 'approved',
      approvedBy: userId,
      approvedByName: user.name,
      approvedAt: new Date(),
      notes,
    };
  }

  const salesDone = batch.salesApproval.status === 'approved';
  const opsDone = batch.opsApproval.status === 'approved';
  const monthName = getMonthName(batch.period.year, batch.period.month);
  const label = `${batch.projectId.name} (${batch.clientId.name})`;

  if (salesDone && opsDone) {
    batch.status = 'fully_approved';

    if (batch.uploadedBy) {
      await notifyUsers([batch.uploadedBy], {
        type: 'attendance_fully_approved',
        title: 'Attendance fully approved',
        message: `${label} attendance for ${monthName} ${batch.period.year} approved by both Sales and Operations. You can now generate the invoice and run salaries.`,
        referenceModel: 'AttendanceBatch',
        referenceId: batchId,
        triggeredBy: userId,
        triggeredByName: user.name,
      });
    }
  } else if (salesDone) {
    batch.status = 'sales_approved';
  } else {
    batch.status = 'ops_approved';
  }

  await batch.save();
  return batch;
}

async function raiseDispute(req, batchId, userId, data) {
  const AttendanceBatch = getModel(req, 'AttendanceBatch');
  const AttendanceDispute = getModel(req, 'AttendanceDispute');
  const User = getModel(req, 'User');

  const [user, batch] = await Promise.all([
    User.findById(userId).populate('roleId', 'name'),
    AttendanceBatch.findById(batchId)
      .populate('projectId', 'name')
      .populate('clientId', 'name'),
  ]);

  const allowed = [
    'pending_review', 'sales_approved', 'ops_approved', 'dispute_responded',
  ];
  if (!allowed.includes(batch.status)) {
    throw Object.assign(
      new Error(`Cannot dispute a batch with status "${batch.status}"`),
      { statusCode: 400 }
    );
  }

  if (!data.reason || data.reason.length < 10) {
    throw Object.assign(
      new Error('Dispute reason must be at least 10 characters'),
      { statusCode: 400 }
    );
  }

  const userPerms = await user.getPermissions();
  const isSalesApprover = userPerms.includes('attendance.approve_sales');

  const dispute = await AttendanceDispute.create({
    batchId,
    projectId: batch.projectId._id,
    clientId: batch.clientId._id,
    raisedBy: userId,
    raisedByName: user.name,
    raisedByRole: isSalesApprover ? 'sales_approver' : 'ops_approver',
    disputeType: data.disputeType,
    reason: data.reason,
    disputedDriverIds: data.disputedDriverIds || [],
    disputedDriverCodes: data.disputedDriverCodes || [],
    status: 'open',
  });

  if (isSalesApprover) {
    batch.salesApproval.status = 'disputed';
    batch.salesApproval.disputedBy = userId;
    batch.salesApproval.disputedByName = user.name;
  } else {
    batch.opsApproval.status = 'disputed';
    batch.opsApproval.disputedBy = userId;
    batch.opsApproval.disputedByName = user.name;
  }
  batch.status = 'disputed';
  batch.disputes.push(dispute._id);
  await batch.save();

  const monthName = getMonthName(batch.period.year, batch.period.month);
  const label = `${batch.projectId.name} (${batch.clientId.name})`;

  if (batch.uploadedBy) {
    await notifyUsers([batch.uploadedBy], {
      type: 'attendance_disputed',
      title: 'Attendance dispute raised',
      message: `${user.name} raised a dispute on ${label} attendance for ${monthName} ${batch.period.year}. Please coordinate with the client, get revised attendance, and re-upload. Reason: ${data.reason.substring(0, 100)}`,
      referenceModel: 'AttendanceBatch',
      referenceId: batchId,
      triggeredBy: userId,
      triggeredByName: user.name,
    });
  }

  // Notify users who can respond to disputes (Accounts team)
  await notifyByPermission('attendance.respond_dispute', {
    type: 'attendance_disputed',
    title: 'Attendance dispute — action required',
    message: `${user.name} (${isSalesApprover ? 'Sales' : 'Operations'}) raised a ${data.disputeType.replace(/_/g, ' ')} dispute on ${label} attendance for ${monthName} ${batch.period.year}. Please review and respond. Reason: ${data.reason.substring(0, 100)}`,
    referenceModel: 'AttendanceBatch',
    referenceId: batchId,
    triggeredBy: userId,
    triggeredByName: user.name,
  });

  return { batch, dispute };
}

async function respondToDispute(req, disputeId, userId, message) {
  const AttendanceDispute = getModel(req, 'AttendanceDispute');
  const User = getModel(req, 'User');

  const dispute = await AttendanceDispute.findById(disputeId)
    .populate('batchId');

  if (!dispute) throw Object.assign(new Error('Dispute not found'), { statusCode: 404 });
  if (dispute.status !== 'open') {
    throw Object.assign(new Error('Dispute is not open'), { statusCode: 400 });
  }

  const user = await User.findById(userId).select('name');

  dispute.status = 'responded';
  dispute.response = {
    respondedBy: userId,
    respondedByName: user.name,
    respondedAt: new Date(),
    message,
  };
  await dispute.save();

  const batch = dispute.batchId;
  batch.status = 'dispute_responded';

  if (dispute.raisedByRole === 'sales' || dispute.raisedByRole === 'sales_approver') {
    batch.salesApproval.status = 'pending';
  } else {
    batch.opsApproval.status = 'pending';
  }
  await batch.save();

  await notifyUsers([dispute.raisedBy], {
    type: 'dispute_responded',
    title: 'Revised attendance uploaded — please re-review',
    message: `${user.name} has uploaded revised attendance. Please re-review and approve or raise a new dispute.`,
    referenceModel: 'AttendanceBatch',
    referenceId: batch._id,
    triggeredBy: userId,
    triggeredByName: user.name,
  });

  return { batch, dispute };
}

module.exports = {
  sendUploadNotification,
  approveAttendance,
  raiseDispute,
  respondToDispute,
};
