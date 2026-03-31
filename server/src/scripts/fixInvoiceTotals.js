/**
 * One-time migration: restore corrupted invoice totals.
 *
 * The legacy addCreditNote flow was directly mutating invoice.total instead of
 * using adjustedTotal. This script recalculates total from subtotal + vatAmount
 * for any invoice where total was incorrectly reduced, and sets adjustedTotal
 * to reflect the credit-note-adjusted value.
 *
 * Usage:  node src/scripts/fixInvoiceTotals.js
 */
const mongoose = require('mongoose');
const path = require('path');

// Load env
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const Invoice = require('../models/Invoice');

const run = async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  // Find invoices where total doesn't match subtotal + vatAmount (corrupted by legacy credit note bug)
  const invoices = await Invoice.find({
    isDeleted: { $ne: true },
    subtotal: { $gt: 0 },
  });

  let fixed = 0;

  for (const inv of invoices) {
    const expectedTotal = Math.round((inv.subtotal + inv.vatAmount) * 100) / 100;

    if (Math.abs(inv.total - expectedTotal) > 0.01) {
      const totalCreditNotes = (inv.creditNotes || []).reduce((sum, cn) => sum + (cn.amount || 0), 0);
      const totalLinkedCN = (inv.linkedCreditNotes || []).reduce((sum, lcn) => sum + (lcn.amount || 0), 0);
      const adjusted = Math.round((expectedTotal - totalCreditNotes - totalLinkedCN) * 100) / 100;

      console.log(
        `Fixing ${inv.invoiceNo}: total ${inv.total} -> ${expectedTotal}, adjustedTotal -> ${adjusted}`
      );

      inv.total = expectedTotal;
      inv.adjustedTotal = adjusted;
      await inv.save();
      fixed++;
    }
  }

  console.log(`Done. Fixed ${fixed} invoice(s).`);
  await mongoose.disconnect();
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
