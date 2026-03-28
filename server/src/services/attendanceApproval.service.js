const {
  AttendanceBatch, AttendanceDispute, Project, User,
} = require('../models');
const { notifyByRole, notifyUsers } = require('./notification.service');

function getMonthName(year, month) {
  return new Date(year, month - 1).toLocaleString('en', { month: 'long' });
}

async function sendUploadNotification(batchId, uploadedByUserId) {
  const batch = await AttendanceBatch.findById(batchId)
    .populate('projectId', 'name projectCode')
    .populate('clientId', 'name');

  const monthName = getMonthName(batch.period.year, batch.period.month);
  const projectLabel = `${batch.projectId.name} (${batch.clientId.name})`;

  const count = await notifyByRole(['sales', 'ops'], {
    type: 'attendance_uploaded',
    title: 'Attendance uploaded — review required',
    message: `Attendance for ${projectLabel} — ${monthName} ${batch.period.year} has been uploaded and needs your review. Please approve or raise a dispute.`,
    referenceModel: 'AttendanceBatch',
    referenceId: batchId,
    triggeredBy: uploadedByUserId,
    triggeredByName: batch.uploadedByName,
  });

  batch.status = 'pending_review';
  batch.notificationSentAt = new Date();
  await batch.save();

  return { notifiedCount: count };
}

async function approveAttendance(batchId, userId, notes) {
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

  const roleName = user.roleId?.name?.toLowerCase();
  const isSales = roleName === 'sales';
  const isOps = roleName === 'ops' || roleName === 'operations';

  if (!isSales && !isOps) {
    throw Object.assign(
      new Error('Only Sales or Operations users can approve attendance'),
      { statusCode: 403 }
    );
  }

  if (isSales) {
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

async function raiseDispute(batchId, userId, data) {
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

  const roleName = user.roleId?.name?.toLowerCase();

  const dispute = await AttendanceDispute.create({
    batchId,
    projectId: batch.projectId._id,
    clientId: batch.clientId._id,
    raisedBy: userId,
    raisedByName: user.name,
    raisedByRole: roleName,
    disputeType: data.disputeType,
    reason: data.reason,
    disputedDriverIds: data.disputedDriverIds || [],
    disputedDriverCodes: data.disputedDriverCodes || [],
    status: 'open',
  });

  if (roleName === 'sales') {
    batch.salesApproval.status = 'disputed';
  } else {
    batch.opsApproval.status = 'disputed';
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

  return { batch, dispute };
}

async function respondToDispute(disputeId, userId, message) {
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

  if (dispute.raisedByRole === 'sales') {
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
