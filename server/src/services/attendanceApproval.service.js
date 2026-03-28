const { AttendanceBatch, AttendanceDispute, User } = require('../models');
const { notifyByRole, notifyUsers } = require('./notification.service');

async function notifyAfterUpload(batchId, uploadedByUserId) {
  const batch = await AttendanceBatch.findById(batchId)
    .populate('clientId', 'name');

  const monthName = new Date(batch.period.year, batch.period.month - 1)
    .toLocaleString('en', { month: 'long' });

  const notifPayload = {
    type: 'attendance_uploaded',
    title: 'Attendance uploaded for review',
    message: `${batch.uploadedByName} uploaded attendance for ${batch.clientId.name} — ${monthName} ${batch.period.year}. Please review and approve or raise a dispute.`,
    referenceModel: 'AttendanceBatch',
    referenceId: batchId,
    triggeredBy: uploadedByUserId,
    triggeredByName: batch.uploadedByName,
  };

  const count = await notifyByRole(['sales', 'ops'], notifPayload);

  batch.status = 'pending_review';
  batch.notificationSentAt = new Date();
  await batch.save();

  return { notifiedCount: count };
}

async function approveAttendance(batchId, userId, notes) {
  const user = await User.findById(userId).populate('roleId', 'name');
  const batch = await AttendanceBatch.findById(batchId)
    .populate('clientId', 'name');

  if (!['pending_review', 'sales_approved', 'ops_approved', 'dispute_responded'].includes(batch.status)) {
    throw Object.assign(
      new Error(`Cannot approve a batch with status "${batch.status}"`),
      { statusCode: 400 }
    );
  }

  const roleName = user.roleId?.name;

  if (roleName === 'sales' || roleName === 'Sales') {
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
      notes: notes || '',
    };
  } else if (roleName === 'ops' || roleName === 'operations') {
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
      notes: notes || '',
    };
  } else {
    throw Object.assign(
      new Error('Only Sales or Operations users can approve attendance'),
      { statusCode: 403 }
    );
  }

  const salesDone = batch.salesApproval.status === 'approved';
  const opsDone = batch.opsApproval.status === 'approved';

  if (salesDone && opsDone) {
    batch.status = 'fully_approved';

    const monthName = new Date(batch.period.year, batch.period.month - 1)
      .toLocaleString('en', { month: 'long' });

    if (batch.uploadedBy) {
      await notifyUsers([batch.uploadedBy], {
        type: 'attendance_fully_approved',
        title: 'Attendance fully approved',
        message: `Attendance for ${batch.clientId.name} ${monthName} ${batch.period.year} has been approved by both Sales and Operations. You can now generate the invoice.`,
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

async function raiseDispute(batchId, userId, disputeData) {
  const user = await User.findById(userId).populate('roleId', 'name');
  const batch = await AttendanceBatch.findById(batchId)
    .populate('clientId', 'name');

  const allowed = ['pending_review', 'sales_approved', 'ops_approved', 'dispute_responded'];
  if (!allowed.includes(batch.status)) {
    throw Object.assign(
      new Error(`Cannot dispute a batch with status "${batch.status}"`),
      { statusCode: 400 }
    );
  }

  if (!disputeData.reason || disputeData.reason.length < 10) {
    throw Object.assign(
      new Error('Dispute reason must be at least 10 characters'),
      { statusCode: 400 }
    );
  }

  const roleName = user.roleId?.name;

  const dispute = await AttendanceDispute.create({
    batchId,
    clientId: batch.clientId,
    raisedBy: userId,
    raisedByName: user.name,
    raisedByRole: roleName,
    disputeType: disputeData.disputeType,
    reason: disputeData.reason,
    disputedDriverIds: disputeData.disputedDriverIds || [],
    disputedDriverCodes: disputeData.disputedDriverCodes || [],
    status: 'open',
  });

  if (roleName === 'sales' || roleName === 'Sales') {
    batch.salesApproval.status = 'disputed';
  } else {
    batch.opsApproval.status = 'disputed';
  }
  batch.status = 'disputed';
  batch.disputes.push(dispute._id);
  await batch.save();

  const monthName = new Date(batch.period.year, batch.period.month - 1)
    .toLocaleString('en', { month: 'long' });

  if (batch.uploadedBy) {
    await notifyUsers([batch.uploadedBy], {
      type: 'attendance_disputed',
      title: 'Attendance dispute raised',
      message: `${user.name} (${roleName}) raised a dispute on ${batch.clientId.name} attendance for ${monthName} ${batch.period.year}. Reason: ${disputeData.reason.substring(0, 80)}`,
      referenceModel: 'AttendanceBatch',
      referenceId: batchId,
      triggeredBy: userId,
      triggeredByName: user.name,
    });
  }

  return { batch, dispute };
}

async function respondToDispute(disputeId, userId, message) {
  const dispute = await AttendanceDispute.findById(disputeId);
  if (!dispute) {
    throw Object.assign(new Error('Dispute not found'), { statusCode: 404 });
  }
  if (dispute.status !== 'open') {
    throw Object.assign(
      new Error(`Cannot respond to a dispute with status "${dispute.status}"`),
      { statusCode: 400 }
    );
  }

  const user = await User.findById(userId);
  const batch = await AttendanceBatch.findById(dispute.batchId)
    .populate('clientId', 'name');

  dispute.status = 'responded';
  dispute.response = {
    respondedBy: userId,
    respondedByName: user.name,
    respondedAt: new Date(),
    message,
  };
  await dispute.save();

  batch.status = 'dispute_responded';
  if (dispute.raisedByRole === 'sales' || dispute.raisedByRole === 'Sales') {
    batch.salesApproval.status = 'pending';
  } else {
    batch.opsApproval.status = 'pending';
  }
  await batch.save();

  const clientName = batch.clientId?.name || 'Unknown';
  await notifyUsers([dispute.raisedBy], {
    type: 'dispute_responded',
    title: 'Accounts responded to your dispute',
    message: `Your dispute on ${clientName} attendance has been responded to by ${user.name}. Please review and re-approve or escalate.`,
    referenceModel: 'AttendanceBatch',
    referenceId: batch._id,
    triggeredBy: userId,
    triggeredByName: user.name,
  });

  return { batch, dispute };
}

async function getBatchWithApprovals(batchId) {
  return AttendanceBatch.findById(batchId)
    .populate('clientId', 'name')
    .populate('uploadedBy', 'name email')
    .populate('salesApproval.approvedBy', 'name')
    .populate('opsApproval.approvedBy', 'name')
    .populate({
      path: 'disputes',
      match: { status: { $in: ['open', 'responded'] } },
      populate: { path: 'raisedBy', select: 'name' },
    });
}

module.exports = {
  notifyAfterUpload,
  approveAttendance,
  raiseDispute,
  respondToDispute,
  getBatchWithApprovals,
};
