const { getModel } = require('../../config/modelRegistry');

/**
 * Record a recovery against a driver receivable.
 */
const recordRecovery = async (req, receivableId, { method, amount, reference, note }, userId) => {
  const DriverReceivable = getModel(req, 'DriverReceivable');
  const DriverLedger = getModel(req, 'DriverLedger');

  const receivable = await DriverReceivable.findById(receivableId);
  if (!receivable) {
    const err = new Error('Driver receivable not found');
    err.statusCode = 404;
    throw err;
  }

  if (receivable.status === 'recovered' || receivable.status === 'written_off') {
    const err = new Error(`Cannot record recovery — receivable is already ${receivable.status}`);
    err.statusCode = 400;
    throw err;
  }

  const recoveryAmount = Math.round(parseFloat(amount) * 100) / 100;
  const maxRecoverable = Math.round((receivable.amount - receivable.amountRecovered - (receivable.writeOffAmount || 0)) * 100) / 100;

  if (recoveryAmount <= 0) {
    const err = new Error('Recovery amount must be greater than zero');
    err.statusCode = 400;
    throw err;
  }

  if (recoveryAmount > maxRecoverable) {
    const err = new Error(`Recovery amount (${recoveryAmount}) exceeds remaining balance (${maxRecoverable})`);
    err.statusCode = 400;
    throw err;
  }

  receivable.recoveries.push({
    method,
    amount: recoveryAmount,
    reference: reference || '',
    note: note || '',
    recoveredBy: userId,
    recoveredAt: new Date(),
  });

  receivable.amountRecovered = Math.round((receivable.amountRecovered + recoveryAmount) * 100) / 100;

  const totalSettled = receivable.amountRecovered + (receivable.writeOffAmount || 0);
  if (totalSettled >= receivable.amount) {
    receivable.status = 'recovered';
  } else {
    receivable.status = 'partially_recovered';
  }

  await receivable.save();

  // Post credit entry to driver ledger
  const lastEntry = await DriverLedger.findOne({ driverId: receivable.driverId, isDeleted: { $ne: true } })
    .sort({ createdAt: -1 });
  const previousBalance = lastEntry?.runningBalance || 0;

  await DriverLedger.create({
    driverId: receivable.driverId,
    entryType: 'manual_credit',
    debit: 0,
    credit: recoveryAmount,
    runningBalance: previousBalance + recoveryAmount,
    description: `Receivable recovery (${method}) — ${receivable.receivableNo}`,
    referenceId: String(receivable._id),
    period: {
      year: new Date().getFullYear(),
      month: new Date().getMonth() + 1,
    },
    createdBy: userId,
  });

  // If fully recovered, also mark the CN line as manually resolved
  if (receivable.status === 'recovered') {
    await resolveLinkedCreditNoteLine(req, receivable, userId);
  }

  return receivable;
};

/**
 * Write off a driver receivable (requires approval context).
 */
const writeOff = async (req, receivableId, { reason }, userId) => {
  const DriverReceivable = getModel(req, 'DriverReceivable');

  const receivable = await DriverReceivable.findById(receivableId);
  if (!receivable) {
    const err = new Error('Driver receivable not found');
    err.statusCode = 404;
    throw err;
  }

  if (receivable.status === 'recovered' || receivable.status === 'written_off') {
    const err = new Error(`Cannot write off — receivable is already ${receivable.status}`);
    err.statusCode = 400;
    throw err;
  }

  const remainingAmount = Math.round((receivable.amount - receivable.amountRecovered) * 100) / 100;

  receivable.writtenOff = true;
  receivable.writeOffAmount = remainingAmount;
  receivable.writeOffReason = reason;
  receivable.writeOffApprovedBy = userId;
  receivable.writeOffApprovedAt = new Date();
  receivable.status = 'written_off';
  await receivable.save();

  // Mark the CN line as manually resolved with write-off note
  await resolveLinkedCreditNoteLine(req, receivable, userId, `Written off: ${reason}`);

  return receivable;
};

/**
 * Resolve the linked credit note line when a receivable is settled.
 */
const resolveLinkedCreditNoteLine = async (req, receivable, userId, note) => {
  const CreditNote = getModel(req, 'CreditNote');

  const cn = await CreditNote.findById(receivable.creditNoteId);
  if (!cn) return;

  const line = cn.lineItems.id(receivable.lineItemId);
  if (!line || line.manuallyResolved || line.salaryDeducted) return;

  line.manuallyResolved = true;
  line.manualResolutionNote = note || `Recovered via receivable ${receivable.receivableNo}`;
  line.manualResolvedBy = userId;
  line.manualResolvedAt = new Date();
  await cn.save();

  // Check if entire CN is now settled
  const { checkAndSettleCreditNote } = require('../billing/creditNote.service');
  await checkAndSettleCreditNote(req, cn._id);
};

/**
 * Get dashboard summary of driver receivables.
 */
const getSummary = async (req) => {
  const DriverReceivable = getModel(req, 'DriverReceivable');

  const [total, outstanding, partiallyRecovered, recovered, writtenOff, amountAgg] = await Promise.all([
    DriverReceivable.countDocuments({ isDeleted: { $ne: true } }),
    DriverReceivable.countDocuments({ isDeleted: { $ne: true }, status: 'outstanding' }),
    DriverReceivable.countDocuments({ isDeleted: { $ne: true }, status: 'partially_recovered' }),
    DriverReceivable.countDocuments({ isDeleted: { $ne: true }, status: 'recovered' }),
    DriverReceivable.countDocuments({ isDeleted: { $ne: true }, status: 'written_off' }),
    DriverReceivable.aggregate([
      { $match: { isDeleted: { $ne: true } } },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: '$amount' },
          totalRecovered: { $sum: '$amountRecovered' },
          totalWrittenOff: { $sum: { $ifNull: ['$writeOffAmount', 0] } },
        },
      },
    ]),
  ]);

  const agg = amountAgg[0] || { totalAmount: 0, totalRecovered: 0, totalWrittenOff: 0 };

  return {
    total,
    outstanding,
    partiallyRecovered,
    recovered,
    writtenOff,
    totalAmount: agg.totalAmount,
    totalRecovered: agg.totalRecovered,
    totalWrittenOff: agg.totalWrittenOff,
    totalOutstanding: Math.round((agg.totalAmount - agg.totalRecovered - agg.totalWrittenOff) * 100) / 100,
  };
};

module.exports = {
  recordRecovery,
  writeOff,
  getSummary,
};
