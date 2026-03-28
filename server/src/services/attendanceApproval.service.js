const { AttendanceBatch, AttendanceDispute, User } = require('../models');
const { notifyByRole, notifyUsers } = require('./notification.service');

const MONTH_NAMES = [
  '', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * Notify Sales and Ops users after attendance upload.
 */
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

/**
 * Approve a batch (Sales or Ops user).
 * Determines which team the user belongs to and records the approval.
 * If both teams have approved, marks the batch as fully_approved.
 */
async function approveAttendance(batchId, userId, notes) {
  const batch = await AttendanceBatch.findById(batchId).populate('clientId', 'name');
  if (!batch) {
    const err = new Error('Batch not found');
    err.statusCode = 404;
    throw err;
  }

  const allowedStatuses = ['pending_review', 'sales_approved', 'ops_approved', 'dispute_responded'];
  if (!allowedStatuses.includes(batch.status)) {
    const err = new Error(`Cannot approve a batch with status "${batch.status}"`);
    err.statusCode = 400;
    throw err;
  }

  const user = await User.findById(userId).populate('roleId', 'name');
  if (!user) {
    const err = new Error('User not found');
    err.statusCode = 404;
    throw err;
  }

  const roleName = user.roleId?.name;
  const isSales = ['sales', 'Sales', 'admin'].includes(roleName);
  const isOps = ['operations', 'ops', 'admin'].includes(roleName);

  if (!isSales && !isOps) {
    const err = new Error('Only Sales or Operations users can approve attendance');
    err.statusCode = 403;
    throw err;
  }

  // Determine which approval to set
  if (isSales && batch.salesApproval?.status !== 'approved') {
    batch.salesApproval = {
      status: 'approved',
      approvedBy: userId,
      approvedByName: user.name,
      approvedAt: new Date(),
      notes: notes || '',
    };
  }

  if (isOps && batch.opsApproval?.status !== 'approved') {
    batch.opsApproval = {
      status: 'approved',
      approvedBy: userId,
      approvedByName: user.name,
      approvedAt: new Date(),
      notes: notes || '',
    };
  }

  // Determine batch status
  const salesApproved = batch.salesApproval?.status === 'approved';
  const opsApproved = batch.opsApproval?.status === 'approved';

  if (salesApproved && opsApproved) {
    batch.status = 'fully_approved';
  } else if (salesApproved) {
    batch.status = 'sales_approved';
  } else if (opsApproved) {
    batch.status = 'ops_approved';
  }

  await batch.save();

  // Notify relevant parties
  const monthName = MONTH_NAMES[batch.period.month] || '';
  const periodStr = `${monthName} ${batch.period.year}`;
  const clientName = batch.clientId?.name || 'Unknown Client';

  if (batch.status === 'fully_approved') {
    // Notify accounts (uploader) that both teams have approved
    const notifyTargets = [];
    if (batch.uploadedBy) notifyTargets.push(batch.uploadedBy);

    if (notifyTargets.length) {
      await notifyUsers(notifyTargets, {
        type: 'attendance_fully_approved',
        title: 'Attendance fully approved',
        message: `Attendance for ${clientName} — ${periodStr} has been approved by both Sales and Operations. Invoice can now be generated.`,
        referenceModel: 'AttendanceBatch',
        referenceId: batch._id,
        triggeredBy: userId,
        triggeredByName: user.name,
      });
    }

    await notifyByRole(['accountant', 'accounts'], {
      type: 'attendance_fully_approved',
      title: 'Attendance fully approved',
      message: `Attendance for ${clientName} — ${periodStr} has been approved by both Sales and Operations. Invoice can now be generated.`,
      referenceModel: 'AttendanceBatch',
      referenceId: batch._id,
      triggeredBy: userId,
      triggeredByName: user.name,
    });
  } else {
    // Notify the other team
    const notifyRole = salesApproved && !opsApproved ? ['operations', 'ops'] : ['sales'];
    await notifyByRole(notifyRole, {
      type: 'attendance_approved',
      title: 'Attendance approved',
      message: `${user.name} (${roleName}) approved attendance for ${clientName} — ${periodStr}. Waiting for your team's approval.`,
      referenceModel: 'AttendanceBatch',
      referenceId: batch._id,
      triggeredBy: userId,
      triggeredByName: user.name,
    });
  }

  return batch;
}

/**
 * Raise a dispute on a batch.
 */
async function raiseDispute(batchId, userId, body) {
  const batch = await AttendanceBatch.findById(batchId).populate('clientId', 'name');
  if (!batch) {
    const err = new Error('Batch not found');
    err.statusCode = 404;
    throw err;
  }

  const allowedStatuses = ['pending_review', 'sales_approved', 'ops_approved', 'dispute_responded'];
  if (!allowedStatuses.includes(batch.status)) {
    const err = new Error(`Cannot dispute a batch with status "${batch.status}"`);
    err.statusCode = 400;
    throw err;
  }

  const user = await User.findById(userId).populate('roleId', 'name');
  if (!user) {
    const err = new Error('User not found');
    err.statusCode = 404;
    throw err;
  }

  const roleName = user.roleId?.name;
  const isSales = ['sales', 'Sales', 'admin'].includes(roleName);
  const isOps = ['operations', 'ops', 'admin'].includes(roleName);

  // Create dispute record
  const dispute = await AttendanceDispute.create({
    batchId,
    clientId: batch.clientId._id || batch.clientId,
    raisedBy: userId,
    raisedByName: user.name,
    raisedByRole: roleName,
    disputeType: body.disputeType,
    reason: body.reason,
    disputedDriverIds: body.disputedDriverIds || [],
    disputedDriverCodes: body.disputedDriverCodes || [],
    status: 'open',
  });

  // Update the relevant approval to disputed
  if (isSales) {
    batch.salesApproval = {
      ...batch.salesApproval?.toObject?.() || {},
      status: 'disputed',
    };
  }
  if (isOps) {
    batch.opsApproval = {
      ...batch.opsApproval?.toObject?.() || {},
      status: 'disputed',
    };
  }

  batch.status = 'disputed';
  batch.disputes.push(dispute._id);
  await batch.save();

  // Notify accounts team and the uploader
  const monthName = MONTH_NAMES[batch.period.month] || '';
  const clientName = batch.clientId?.name || 'Unknown Client';

  await notifyByRole(['accountant', 'accounts'], {
    type: 'attendance_disputed',
    title: 'Attendance disputed',
    message: `${user.name} (${roleName}) raised a dispute for ${clientName} — ${monthName} ${batch.period.year}: ${body.reason.substring(0, 100)}`,
    referenceModel: 'AttendanceBatch',
    referenceId: batch._id,
    triggeredBy: userId,
    triggeredByName: user.name,
  });

  if (batch.uploadedBy) {
    await notifyUsers([batch.uploadedBy], {
      type: 'attendance_disputed',
      title: 'Attendance dispute raised',
      message: `${user.name} (${roleName}) raised a dispute on ${clientName} attendance for ${monthName} ${batch.period.year}. Reason: ${body.reason.substring(0, 80)}`,
      referenceModel: 'AttendanceBatch',
      referenceId: batchId,
      triggeredBy: userId,
      triggeredByName: user.name,
    });
  }

  return dispute;
}

/**
 * Accounts responds to an open dispute.
 */
async function respondToDispute(disputeId, userId, message) {
  const dispute = await AttendanceDispute.findById(disputeId);
  if (!dispute) {
    const err = new Error('Dispute not found');
    err.statusCode = 404;
    throw err;
  }

  if (dispute.status !== 'open') {
    const err = new Error(`Cannot respond to a dispute in "${dispute.status}" status`);
    err.statusCode = 400;
    throw err;
  }

  const user = await User.findById(userId).select('name');
  if (!user) {
    const err = new Error('User not found');
    err.statusCode = 404;
    throw err;
  }

  dispute.status = 'responded';
  dispute.response = {
    respondedBy: userId,
    respondedByName: user.name,
    respondedAt: new Date(),
    message,
  };
  await dispute.save();

  // Update batch status and reset the disputed approval to pending
  const batch = await AttendanceBatch.findById(dispute.batchId)
    .populate('clientId', 'name');
  if (batch) {
    batch.status = 'dispute_responded';
    if (dispute.raisedByRole === 'sales' || dispute.raisedByRole === 'Sales') {
      batch.salesApproval.status = 'pending';
    } else {
      batch.opsApproval.status = 'pending';
    }
    await batch.save();
  }

  // Notify the user who raised the dispute
  await notifyUsers([dispute.raisedBy], {
    type: 'dispute_responded',
    title: 'Dispute response received',
    message: `${user.name} responded to your dispute: ${message.substring(0, 100)}`,
    referenceModel: 'AttendanceBatch',
    referenceId: dispute.batchId,
    triggeredBy: userId,
    triggeredByName: user.name,
  });

  return dispute;
}

/**
 * Get batch with full approval details.
 */
async function getBatchWithApprovals(batchId) {
  return AttendanceBatch.findById(batchId)
    .populate('clientId', 'name')
    .populate('uploadedBy', 'name email')
    .populate('salesApproval.approvedBy', 'name')
    .populate('opsApproval.approvedBy', 'name')
    .populate('invoiceId')
    .populate({
      path: 'disputes',
      populate: [
        { path: 'raisedBy', select: 'name' },
        { path: 'response.respondedBy', select: 'name' },
      ],
    });
}

module.exports = {
  notifyAfterUpload,
  approveAttendance,
  raiseDispute,
  respondToDispute,
  getBatchWithApprovals,
};
