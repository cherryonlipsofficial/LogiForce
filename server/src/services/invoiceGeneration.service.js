const {
  AttendanceBatch, AttendanceRecord, Invoice,
  Driver, Project, ProjectContract, DriverProjectAssignment,
  User,
} = require('../models')
const { notifyByPermission } = require('./notification.service')
const { computeLineAmount } = require('../utils/rateCalculator')

/**
 * Generate an invoice from a fully-approved attendance batch.
 * Rate is taken from the project. VAT is 5%.
 * Only accounts users can generate invoices.
 */
async function generateInvoice(batchId, accountsUserId) {
  // STEP 1 — Validate batch
  const batch = await AttendanceBatch.findById(batchId)
    .populate('projectId', 'name projectCode ratePerDriver rateBasis clientId')
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
    status: { $ne: 'error' },  // skip errored rows
  })
  .populate('driverId', 'fullName employeeCode projectId')
  .lean()

  if (!records.length) {
    throw Object.assign(
      new Error('No valid attendance records found for this batch.'),
      { statusCode: 400 }
    )
  }

  // STEP 3 — Get billing rate and basis from project
  // Priority: active ProjectContract rate → project.ratePerDriver fallback
  let ratePerDriver = batch.projectId.ratePerDriver
  let rateBasis = batch.projectId.rateBasis || 'monthly_fixed'

  const activeContract = await ProjectContract.findOne({
    projectId: batch.projectId._id,
    status:    'active',
  }).select('ratePerDriver rateBasis')

  if (activeContract?.ratePerDriver) {
    ratePerDriver = activeContract.ratePerDriver
  }
  if (activeContract?.rateBasis) {
    rateBasis = activeContract.rateBasis
  }

  if (!ratePerDriver || ratePerDriver <= 0) {
    throw Object.assign(
      new Error(
        `Project "${batch.projectId.name}" has no rate configured.
         Set a rate per driver on the project before generating an invoice.`
      ),
      { statusCode: 400 }
    )
  }

  // STEP 4 — Build line items (one per driver)
  const lineItems = []
  let subtotal = 0

  for (const record of records) {
    const driver = record.driverId
    if (!driver) continue

    const workingDays = record.workingDays || 0
    if (workingDays <= 0) continue   // skip zero-day records — they add nothing to the invoice

    const { dailyRate, amount } = computeLineAmount(ratePerDriver, rateBasis, workingDays)

    const vatAmount_item = parseFloat((amount * 0.05).toFixed(2))
    const totalWithVat   = parseFloat((amount + vatAmount_item).toFixed(2))

    lineItems.push({
      driverId:     driver._id,
      driverName:   driver.fullName,
      employeeCode: driver.employeeCode,
      workingDays,
      ratePerDriver,
      rateBasis,
      dailyRate,
      amount,
      vatRate:      0.05,
      vatAmount:    vatAmount_item,
      totalWithVat,
    })

    subtotal += amount
  }

  if (!lineItems.length) {
    throw Object.assign(
      new Error('No valid driver records to invoice.'),
      { statusCode: 400 }
    )
  }

  subtotal  = parseFloat(subtotal.toFixed(2))
  const vatAmount = parseFloat((subtotal * 0.05).toFixed(2))
  const total     = parseFloat((subtotal + vatAmount).toFixed(2))

  // STEP 5 — Generate invoice number
  const monthStr  = String(batch.period.month).padStart(2, '0')
  const yearStr   = String(batch.period.year)
  const count     = await Invoice.countDocuments() + 1
  const invoiceNo = `INV-${yearStr}-${monthStr}-${String(count).padStart(4, '0')}`

  // STEP 6 — Due date from payment terms
  const paymentTerms = batch.clientId.paymentTerms || 'Net 30'
  const termDays     = parseInt(paymentTerms.replace(/\D/g, '')) || 30
  const dueDate      = new Date()
  dueDate.setDate(dueDate.getDate() + termDays)

  // STEP 6b — Compute service period from/to
  const servicePeriodFrom = new Date(batch.period.year, batch.period.month - 1, 1)
  const servicePeriodTo   = new Date(batch.period.year, batch.period.month, 0) // last day

  // STEP 7 — Create invoice
  const invoice = await Invoice.create({
    invoiceNo,
    projectId:         batch.projectId._id,
    clientId:          batch.clientId._id,
    attendanceBatchId: batchId,
    period:            batch.period,
    servicePeriodFrom,
    servicePeriodTo,
    lineItems,
    subtotal,
    vatRate:    0.05,
    vatAmount,
    total,
    status:    'draft',
    issuedDate: new Date(),
    dueDate,
    createdBy:  accountsUserId,
  })

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
  await notifyByPermission('attendance.approve_sales', invoicePayload)
  await notifyByPermission('attendance.approve_ops', invoicePayload)

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

module.exports = { generateInvoice }
