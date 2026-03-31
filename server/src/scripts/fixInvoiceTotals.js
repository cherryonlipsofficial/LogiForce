/**
 * One-time migration: recalculate invoice totals.
 *
 * Fixes two issues:
 * 1. The legacy addCreditNote flow was directly mutating invoice.total instead
 *    of using adjustedTotal — restores original total from subtotal + vatAmount.
 * 2. Recalculates line item amounts using the corrected rate logic:
 *    - monthly_fixed: pro-rata on calendar days (full rate for full month)
 *    - daily_rate: rate × workingDays
 *    - per_order: rate × totalOrders
 *
 * Usage:  node src/scripts/fixInvoiceTotals.js
 */
const mongoose = require('mongoose');
const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const Invoice = require('../models/Invoice');
const { computeLineAmount } = require('../utils/rateCalculator');

const VAT_RATE = 0.05;

const run = async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  const invoices = await Invoice.find({ isDeleted: { $ne: true } });
  let fixed = 0;

  for (const inv of invoices) {
    const year = inv.period?.year;
    const month = inv.period?.month;
    if (!year || !month) continue;

    let needsSave = false;

    // Recalculate line items with corrected rate logic
    if (inv.lineItems && inv.lineItems.length > 0) {
      let newSubtotal = 0;

      for (const li of inv.lineItems) {
        const rate = li.ratePerDriver || 0;
        const rateBasis = li.rateBasis || 'monthly_fixed';
        const { dailyRate, amount } = computeLineAmount(rate, rateBasis, li.workingDays || 0, {
          year, month, totalOrders: li.totalOrders || 0,
        });

        if (Math.abs((li.amount || 0) - amount) > 0.01) {
          li.dailyRate = dailyRate;
          li.amount = amount;
          li.vatAmount = parseFloat((amount * VAT_RATE).toFixed(2));
          li.totalWithVat = parseFloat((amount + li.vatAmount).toFixed(2));
          needsSave = true;
        }
        newSubtotal += li.amount;
      }

      newSubtotal = parseFloat(newSubtotal.toFixed(2));
      const newVat = parseFloat((newSubtotal * VAT_RATE).toFixed(2));
      const newTotal = parseFloat((newSubtotal + newVat).toFixed(2));

      if (Math.abs(inv.subtotal - newSubtotal) > 0.01) {
        inv.subtotal = newSubtotal;
        inv.vatAmount = newVat;
        inv.total = newTotal;
        needsSave = true;
      }
    }

    // Fix corrupted total (from legacy credit note bug)
    const expectedTotal = Math.round((inv.subtotal + inv.vatAmount) * 100) / 100;
    if (Math.abs(inv.total - expectedTotal) > 0.01) {
      inv.total = expectedTotal;
      needsSave = true;
    }

    // Recalculate adjustedTotal if credit notes exist
    const totalCreditNotes = (inv.creditNotes || []).reduce((sum, cn) => sum + (cn.amount || 0), 0);
    const totalLinkedCN = (inv.linkedCreditNotes || []).reduce((sum, lcn) => sum + (lcn.amount || 0), 0);
    if (totalCreditNotes > 0 || totalLinkedCN > 0) {
      const adjusted = Math.round((inv.total - totalCreditNotes - totalLinkedCN) * 100) / 100;
      if (inv.adjustedTotal !== adjusted) {
        inv.adjustedTotal = adjusted;
        needsSave = true;
      }
    }

    if (needsSave) {
      console.log(`Fixing ${inv.invoiceNo}: total -> ${inv.total}, subtotal -> ${inv.subtotal}`);
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
