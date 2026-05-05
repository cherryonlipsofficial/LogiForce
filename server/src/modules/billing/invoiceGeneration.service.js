const { getModel } = require('../../config/modelRegistry');
const { notifyByPermission } = require('../shared/notification.service')
const { computeLineAmount, computeOTLineAmount } = require('../../utils/rateCalculator')

/**
 * Resolve the effective billing rate and basis for a batch's project.
 *
 * - ratePerDriver: prefer the active contract's rate (the contracted amount),
 *   fall back to the project's rate.
 * - rateBasis: always use the project's value. Rate basis is the project's
 *   billing model (monthly / daily / per-order); when it's changed on the
 *   project, the next invoice should reflect it. The active contract's
 *   rateBasis is kept as a snapshot for historical records but it must not
 *   override the current project configuration during invoicing.
 */
async function resolveProjectRate(req, project) {
  const ProjectContract = getModel(req, 'ProjectContract')
  let ratePerDriver = project?.ratePerDriver || 0
  const rateBasis = project?.rateBasis || 'monthly_fixed'

  if (project?._id) {
    const activeContract = await ProjectContract.findOne({
      projectId: project._id,
      status: 'active',
    }).select('ratePerDriver').lean()

    if (activeContract?.ratePerDriver) ratePerDriver = activeContract.ratePerDriver
  }

  return { ratePerDriver, rateBasis }
}

/**
 * Resolve the effective OT rate and basis for a batch's project. Active
 * contract values override the project defaults so OT batches get billed
 * at the contracted OT rate (e.g., 80 AED per OT hour).
 */
async function resolveProjectOTRate(req, project) {
  const ProjectContract = getModel(req, 'ProjectContract')
  let otRate = Number(project?.otRate) || 0
  let otRateBasis = project?.otRateBasis || 'per_hour'

  if (project?._id) {
    const activeContract = await ProjectContract.findOne({
      projectId: project._id,
      status: 'active',
    }).select('otRate otRateBasis').lean()

    if (activeContract?.otRate) otRate = activeContract.otRate
    if (activeContract?.otRateBasis) otRateBasis = activeContract.otRateBasis
  }

  return { otRate, otRateBasis }
}

/**
 * Compose an error/diagnostic message explaining why a batch produced
 * zero billable line items. Caller passes the rate basis, total records
 * considered, and the per-reason skip counts from buildLineItems.
 */
function buildEmptyLineItemsMessage(rateBasis, considered, skipped) {
  if (considered === 0) {
    return 'No valid attendance records found for this batch. Re-upload the file or override the records.'
  }
  if (rateBasis === 'per_order' && skipped.zeroOrders > 0) {
    return `Project bills per order, but all ${skipped.zeroOrders} attendance record(s) have zero orders. Override the records with order counts or re-upload with a "total_orders" column populated.`
  }
  if (rateBasis !== 'per_order' && skipped.zeroDays > 0) {
    return `Project bills "${rateBasis}", but all ${skipped.zeroDays} attendance record(s) have zero working days. If the project should bill per order, change Rate basis to "Per order" on the project and try again. Otherwise override the records with working days or re-upload with a "working_days" column populated.`
  }
  if (skipped.noDriver > 0) {
    return `${skipped.noDriver} attendance record(s) reference a driver that no longer exists. Restore the drivers or re-upload the batch.`
  }
  return 'No valid driver records to invoice.'
}

/**
 * Build per-driver line items from attendance records using the given rate/basis.
 * Also returns counts of records skipped per reason so callers can explain
 * exactly why a batch produced no billable line items.
 */
function buildLineItems(records, ratePerDriver, rateBasis, period) {
  const lineItems = []
  let subtotal = 0
  const skipped = { noDriver: 0, zeroDays: 0, zeroOrders: 0 }

  for (const record of records) {
    const driver = record.driverId
    if (!driver) {
      skipped.noDriver++
      continue
    }

    const workingDays = record.workingDays || 0
    const totalOrders = record.totalOrders || 0

    if (rateBasis === 'per_order' && totalOrders <= 0) {
      skipped.zeroOrders++
      continue
    }
    if (rateBasis !== 'per_order' && workingDays <= 0) {
      skipped.zeroDays++
      continue
    }

    const { dailyRate, amount } = computeLineAmount(ratePerDriver, rateBasis, workingDays, {
      year: period?.year,
      month: period?.month,
      totalOrders,
    })

    const vatAmount_item = parseFloat((amount * 0.05).toFixed(2))
    const totalWithVat = parseFloat((amount + vatAmount_item).toFixed(2))

    lineItems.push({
      driverId: driver._id,
      driverName: driver.fullName,
      employeeCode: driver.employeeCode,
      workingDays,
      totalOrders,
      ratePerDriver,
      rateBasis,
      dailyRate,
      amount,
      vatRate: 0.05,
      vatAmount: vatAmount_item,
      totalWithVat,
    })

    subtotal += amount
  }

  subtotal = parseFloat(subtotal.toFixed(2))
  const vatAmount = parseFloat((subtotal * 0.05).toFixed(2))
  const total = parseFloat((subtotal + vatAmount).toFixed(2))

  return { lineItems, subtotal, vatAmount, total, skipped }
}

/**
 * Build per-driver OT line items from attendance records using the project's
 * OT rate / basis. Skips records with zero overtimeHours and tracks reasons
 * so callers can explain why a batch produced no billable OT.
 */
function buildOTLineItems(records, otRate, otRateBasis) {
  const lineItems = []
  let subtotal = 0
  const skipped = { noDriver: 0, zeroOT: 0 }

  for (const record of records) {
    const driver = record.driverId
    if (!driver) {
      skipped.noDriver++
      continue
    }

    const overtimeHours = Number(record.overtimeHours) || 0
    if (overtimeHours <= 0) {
      skipped.zeroOT++
      continue
    }

    const { amount } = computeOTLineAmount(otRate, otRateBasis, overtimeHours)
    if (amount <= 0) {
      skipped.zeroOT++
      continue
    }

    const vatAmount_item = parseFloat((amount * 0.05).toFixed(2))
    const totalWithVat = parseFloat((amount + vatAmount_item).toFixed(2))

    lineItems.push({
      driverId: driver._id,
      driverName: driver.fullName,
      employeeCode: driver.employeeCode,
      overtimeHours,
      otRate,
      otRateBasis,
      amount,
      vatRate: 0.05,
      vatAmount: vatAmount_item,
      totalWithVat,
    })

    subtotal += amount
  }

  subtotal = parseFloat(subtotal.toFixed(2))
  const vatAmount = parseFloat((subtotal * 0.05).toFixed(2))
  const total = parseFloat((subtotal + vatAmount).toFixed(2))

  return { lineItems, subtotal, vatAmount, total, skipped }
}

function buildEmptyOTLineItemsMessage(considered, skipped) {
  if (considered === 0) {
    return 'No valid attendance records found for this OT batch. Re-upload the file or override the records.'
  }
  if (skipped.zeroOT > 0) {
    return `All ${skipped.zeroOT} attendance record(s) have zero overtime. Override the records with overtime hours/days or re-upload the OT batch with the "overtime_hours" column populated.`
  }
  if (skipped.noDriver > 0) {
    return `${skipped.noDriver} attendance record(s) reference a driver that no longer exists. Restore the drivers or re-upload the batch.`
  }
  return 'No billable overtime records to invoice.'
}

/**
 * Dry-run computation of the invoice that would be generated for a batch.
 * Shares rate resolution and line-item logic with generateInvoice so the
 * preview and the final invoice always match.
 */
async function previewInvoice(req, batchId) {
  const AttendanceBatch = getModel(req, 'AttendanceBatch')
  const AttendanceRecord = getModel(req, 'AttendanceRecord')

  const batch = await AttendanceBatch.findById(batchId)
    .populate('projectId', 'name projectCode ratePerDriver rateBasis otRate otRateBasis clientId')
    .populate('clientId', 'name vatNo paymentTerms')
    .lean()

  if (!batch) throw Object.assign(new Error('Batch not found'), { statusCode: 404 })
  if (!batch.projectId) {
    throw Object.assign(new Error('Batch has no project assigned'), { statusCode: 400 })
  }

  const records = await AttendanceRecord.find({
    batchId,
    status: { $ne: 'error' },
  })
    .populate('driverId', 'fullName employeeCode')
    .lean()

  const errorRecordCount = await AttendanceRecord.countDocuments({
    batchId,
    status: 'error',
  })

  const projectInfo = {
    _id: batch.projectId._id,
    name: batch.projectId.name,
    projectCode: batch.projectId.projectCode,
  }
  const clientInfo = batch.clientId ? {
    _id: batch.clientId._id,
    name: batch.clientId.name,
  } : null

  if (batch.batchType === 'overtime') {
    const { otRate, otRateBasis } = await resolveProjectOTRate(req, batch.projectId)
    const { lineItems, subtotal, vatAmount, total, skipped } = buildOTLineItems(
      records, otRate, otRateBasis
    )

    return {
      batchId: batch._id,
      batchType: 'overtime',
      invoiceType: 'overtime',
      period: batch.period,
      project: projectInfo,
      client: clientInfo,
      // Front-end uses ratePerDriver/rateBasis to render the rate column;
      // for OT we surface the OT rate here so existing rendering still works.
      ratePerDriver: otRate,
      rateBasis: otRateBasis,
      otRate,
      otRateBasis,
      driverCount: lineItems.length,
      lineItems,
      subtotal,
      vatRate: 0.05,
      vatAmount,
      total,
      rateConfigured: otRate > 0,
      diagnostics: {
        consideredRecords: records.length,
        errorRecords: errorRecordCount,
        billableRecords: lineItems.length,
        skippedNoDriver: skipped.noDriver,
        skippedZeroOT: skipped.zeroOT,
      },
    }
  }

  const { ratePerDriver, rateBasis } = await resolveProjectRate(req, batch.projectId)
  const { lineItems, subtotal, vatAmount, total, skipped } = buildLineItems(
    records, ratePerDriver, rateBasis, batch.period
  )

  return {
    batchId: batch._id,
    batchType: 'regular',
    invoiceType: 'regular',
    period: batch.period,
    project: projectInfo,
    client: clientInfo,
    ratePerDriver,
    rateBasis,
    driverCount: lineItems.length,
    lineItems,
    subtotal,
    vatRate: 0.05,
    vatAmount,
    total,
    rateConfigured: ratePerDriver > 0,
    diagnostics: {
      consideredRecords: records.length,
      errorRecords: errorRecordCount,
      billableRecords: lineItems.length,
      skippedNoDriver: skipped.noDriver,
      skippedZeroDays: skipped.zeroDays,
      skippedZeroOrders: skipped.zeroOrders,
    },
  }
}

/**
 * Generate an invoice from a fully-approved attendance batch.
 * Rate is taken from the project. VAT is 5%.
 * Only accounts users can generate invoices.
 */
async function generateInvoice(req, batchId, accountsUserId) {
  const AttendanceBatch = getModel(req, 'AttendanceBatch');
  const AttendanceRecord = getModel(req, 'AttendanceRecord');
  const Invoice = getModel(req, 'Invoice');
  const User = getModel(req, 'User');
  // STEP 1 — Validate batch
  const batch = await AttendanceBatch.findById(batchId)
    .populate('projectId', 'name projectCode ratePerDriver rateBasis otRate otRateBasis clientId')
    .populate('clientId', 'name vatNo paymentTerms')

  if (!batch) throw Object.assign(new Error('Batch not found'), { statusCode: 404 })

  if (batch.status !== 'fully_approved' && batch.status !== 'processed' && batch.status !== 'invoiced') {
    throw Object.assign(
      new Error(
        `Cannot generate invoice. Batch status is "${batch.status}".
         Both Sales and Operations must approve the attendance first.`
      ),
      { statusCode: 400 }
    )
  }

  if (batch.invoiceId || batch.status === 'invoiced') {
    // Check if the linked invoice still exists and is not deleted
    const existingInvoice = await Invoice.findOne({ _id: batch.invoiceId, isDeleted: { $ne: true } }).select('_id')
    if (existingInvoice) {
      throw Object.assign(
        new Error('An invoice has already been generated for this batch.'),
        { statusCode: 400 }
      )
    }
    // Clear stale reference — invoice was deleted
    batch.invoiceId = null
    batch.invoicedAt = null
    batch.invoicedBy = null
    await batch.save()
  }

  // STEP 2 — Fetch attendance records for this batch
  const records = await AttendanceRecord.find({
    batchId,
    status: { $ne: 'error' },
  })
  .populate('driverId', 'fullName employeeCode projectId')
  .lean()

  if (!records.length) {
    throw Object.assign(
      new Error('No valid attendance records found for this batch.'),
      { statusCode: 400 }
    )
  }

  const isOT = batch.batchType === 'overtime'

  // STEP 3 — Resolve rate (active contract overrides project default).
  // OT batches use the project's OT rate × overtimeHours; regular batches
  // use the project rate × workingDays/orders.
  let lineItems, subtotal, vatAmount, total, ratePerDriver, rateBasis
  if (isOT) {
    const { otRate, otRateBasis } = await resolveProjectOTRate(req, batch.projectId)

    if (!otRate || otRate <= 0) {
      throw Object.assign(
        new Error(
          `Project "${batch.projectId.name}" has no OT rate configured. ` +
          `Set an OT rate on the project before generating an OT invoice.`
        ),
        { statusCode: 400 }
      )
    }

    const built = buildOTLineItems(records, otRate, otRateBasis)
    lineItems = built.lineItems
    subtotal = built.subtotal
    vatAmount = built.vatAmount
    total = built.total
    ratePerDriver = otRate
    rateBasis = otRateBasis

    if (!lineItems.length) {
      throw Object.assign(
        new Error(buildEmptyOTLineItemsMessage(records.length, built.skipped)),
        { statusCode: 400 }
      )
    }
  } else {
    const resolved = await resolveProjectRate(req, batch.projectId)
    ratePerDriver = resolved.ratePerDriver
    rateBasis = resolved.rateBasis

    if (!ratePerDriver || ratePerDriver <= 0) {
      throw Object.assign(
        new Error(
          `Project "${batch.projectId.name}" has no rate configured.
         Set a rate per driver on the project before generating an invoice.`
        ),
        { statusCode: 400 }
      )
    }

    const built = buildLineItems(records, ratePerDriver, rateBasis, batch.period)
    lineItems = built.lineItems
    subtotal = built.subtotal
    vatAmount = built.vatAmount
    total = built.total

    if (!lineItems.length) {
      throw Object.assign(
        new Error(buildEmptyLineItemsMessage(rateBasis, records.length, built.skipped)),
        { statusCode: 400 }
      )
    }
  }

  // STEP 5 — Due date from payment terms (invoice number is generated by the
  // Invoice schema's pre-save hook, which switches between INV- and INV-OT-
  // based on invoiceType).
  const paymentTerms = batch.clientId.paymentTerms || 'Net 30'
  const termDays     = parseInt(paymentTerms.replace(/\D/g, '')) || 30
  const dueDate      = new Date()
  dueDate.setDate(dueDate.getDate() + termDays)

  // STEP 6 — Compute service period from/to
  const servicePeriodFrom = new Date(batch.period.year, batch.period.month - 1, 1)
  const servicePeriodTo   = new Date(batch.period.year, batch.period.month, 0) // last day

  // STEP 7 — Create invoice
  const invoice = await Invoice.create({
    invoiceType:       isOT ? 'overtime' : 'regular',
    projectId:         batch.projectId._id,
    clientId:          batch.clientId._id,
    attendanceBatchId: batchId,
    period:            batch.period,
    servicePeriodFrom,
    servicePeriodTo,
    lineItems,
    driverCount: lineItems.length,
    subtotal,
    vatRate:    0.05,
    vatAmount,
    total,
    status:    'draft',
    issuedDate: new Date(),
    dueDate,
    createdBy:  accountsUserId,
  })
  const invoiceNo = invoice.invoiceNo

  // STEP 8 — Mark batch as invoiced
  batch.status    = 'invoiced'
  batch.invoiceId = invoice._id
  batch.invoicedAt = new Date()
  batch.invoicedBy = accountsUserId
  await batch.save()

  // STEP 9 — Notify Sales and Ops
  const accountsUser = await User.findById(accountsUserId).select('name')
  const monthName    = new Date(batch.period.year, batch.period.month - 1)
    .toLocaleString('en', { month: 'long' })

  const invoicePayload = {
    type:    'invoice_generated',
    title:   'Invoice generated',
    message: `Invoice ${invoiceNo} generated for ${batch.projectId.name}
              — ${monthName} ${batch.period.year}.
              Total: AED ${total.toLocaleString()} (incl. 5% VAT)`,
    referenceModel: 'Invoice',
    referenceId:    invoice._id,
    triggeredBy:    accountsUserId,
    triggeredByName: accountsUser.name,
  }
  await notifyByPermission(req, 'attendance.approve_sales', invoicePayload)
  await notifyByPermission(req, 'attendance.approve_ops', invoicePayload)

  // STEP 10 — Return
  return {
    invoice: await Invoice.findById(invoice._id)
      .populate('projectId', 'name projectCode')
      .populate('clientId', 'name'),
    summary: {
      invoiceNo,
      projectName: batch.projectId.name,
      clientName:  batch.clientId.name,
      period:      batch.period,
      driverCount: lineItems.length,
      ratePerDriver,
      subtotal,
      vatAmount,
      total,
    },
  }
}

module.exports = { generateInvoice, previewInvoice }
