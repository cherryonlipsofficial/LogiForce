const PDFDocument = require('pdfkit');

const generateInvoicePDF = (invoice, client) => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const buffers = [];

    doc.on('data', (chunk) => buffers.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);

    // --- Company Header ---
    doc.fontSize(20).font('Helvetica-Bold').text('LogiForce', { align: 'left' });
    doc.fontSize(10).font('Helvetica')
      .text('Logistics Management Platform')
      .text('Dubai, United Arab Emirates')
      .moveDown();

    // --- Invoice Details ---
    doc.fontSize(16).font('Helvetica-Bold').text('INVOICE', { align: 'right' });
    doc.fontSize(10).font('Helvetica');
    const topY = doc.y;
    doc.text(`Invoice No: ${invoice.invoiceNo}`, { align: 'right' });
    doc.text(`Date: ${new Date(invoice.issuedDate).toLocaleDateString('en-GB')}`, { align: 'right' });
    doc.text(`Due Date: ${new Date(invoice.dueDate).toLocaleDateString('en-GB')}`, { align: 'right' });
    doc.text(`Status: ${invoice.status.toUpperCase()}`, { align: 'right' });
    doc.moveDown();

    // --- Client Details ---
    doc.fontSize(12).font('Helvetica-Bold').text('Bill To:');
    doc.fontSize(10).font('Helvetica');
    doc.text(client.name);
    if (client.vatNo) doc.text(`VAT No: ${client.vatNo}`);
    if (client.contactName) doc.text(`Attn: ${client.contactName}`);
    if (client.contactEmail) doc.text(client.contactEmail);
    doc.moveDown();

    // --- Line Items Table ---
    const tableTop = doc.y;
    const colX = { driver: 50, code: 200, days: 290, rate: 360, amount: 440 };

    // Header
    doc.font('Helvetica-Bold').fontSize(9);
    doc.text('Driver Name', colX.driver, tableTop);
    doc.text('Code', colX.code, tableTop);
    doc.text('Days', colX.days, tableTop);
    doc.text('Rate/Day', colX.rate, tableTop);
    doc.text('Amount (AED)', colX.amount, tableTop);

    // Divider
    doc.moveTo(50, tableTop + 15).lineTo(550, tableTop + 15).stroke();

    // Rows
    doc.font('Helvetica').fontSize(9);
    let y = tableTop + 22;

    for (const item of invoice.lineItems) {
      if (y > 700) {
        doc.addPage();
        y = 50;
      }
      doc.text(item.driverName || '', colX.driver, y, { width: 145 });
      doc.text(item.employeeCode || '', colX.code, y);
      doc.text(String(item.workingDays || 0), colX.days, y);
      doc.text((item.dailyRate || item.ratePerDay || 0).toFixed(2), colX.rate, y);
      doc.text((item.amount || 0).toFixed(2), colX.amount, y);
      y += 18;
    }

    // Divider
    doc.moveTo(50, y).lineTo(550, y).stroke();
    y += 10;

    // --- Totals ---
    doc.font('Helvetica').fontSize(10);
    doc.text('Subtotal:', colX.rate, y);
    doc.text(`AED ${(invoice.subtotal || 0).toFixed(2)}`, colX.amount, y);
    y += 18;

    doc.text(`VAT (${((invoice.vatRate || 0) * 100).toFixed(0)}%):`, colX.rate, y);
    doc.text(`AED ${(invoice.vatAmount || 0).toFixed(2)}`, colX.amount, y);
    y += 18;

    // Credit notes
    if (invoice.creditNotes && invoice.creditNotes.length > 0) {
      const totalCredits = invoice.creditNotes.reduce((sum, cn) => sum + cn.amount, 0);
      doc.text('Credit Notes:', colX.rate, y);
      doc.text(`- AED ${totalCredits.toFixed(2)}`, colX.amount, y);
      y += 18;
    }

    doc.font('Helvetica-Bold').fontSize(12);
    doc.text('TOTAL:', colX.rate, y);
    doc.text(`AED ${(invoice.total || 0).toFixed(2)}`, colX.amount, y);
    y += 35;

    // --- Payment Instructions ---
    doc.font('Helvetica-Bold').fontSize(11).text('Payment Instructions', 50, y);
    y += 18;
    doc.font('Helvetica').fontSize(9);
    doc.text(`Payment Terms: ${client.paymentTerms || 'Net 30'}`, 50, y);
    y += 14;
    doc.text(`Currency: ${client.billingCurrency || 'AED'}`, 50, y);
    y += 14;
    doc.text('Please reference the invoice number in your payment.', 50, y);
    y += 14;
    doc.text('Bank details will be provided separately.', 50, y);

    doc.end();
  });
};

module.exports = { generateInvoicePDF };
