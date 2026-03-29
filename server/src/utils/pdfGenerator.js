const PDFDocument = require('pdfkit');
const { amountToWords } = require('./numberToWords');

// ── Helpers ──────────────────────────────────────────────────────────────────

const BLUE = '#B8CCE4';
const BORDER_COLOR = '#000000';
const BORDER_WIDTH = 0.5;
const PAGE_MARGIN = 30;
const CONTENT_WIDTH = 535; // A4 width (595) minus left+right margins

function formatCurrency(num) {
  return Number(num).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDate(date) {
  if (!date) return '';
  const d = new Date(date);
  return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
}

// Column layout for line items table
const TABLE_LEFT = PAGE_MARGIN;
const cols = {
  sr:      { x: TABLE_LEFT,       w: 25  },
  name:    { x: TABLE_LEFT + 25,  w: 190 },
  days:    { x: TABLE_LEFT + 215, w: 55  },
  rate:    { x: TABLE_LEFT + 270, w: 55  },
  amount:  { x: TABLE_LEFT + 325, w: 70  },
  vatRate: { x: TABLE_LEFT + 395, w: 40  },
  vatAmt:  { x: TABLE_LEFT + 435, w: 55  },
  total:   { x: TABLE_LEFT + 490, w: 45  },
};
const TABLE_WIDTH = cols.total.x + cols.total.w - TABLE_LEFT;
const TABLE_RIGHT = TABLE_LEFT + TABLE_WIDTH;

// ── Drawing primitives ───────────────────────────────────────────────────────

function drawCell(doc, x, y, w, h, options = {}) {
  const { fill, text, font, fontSize, align, padding, textColor } = {
    fill: null,
    text: '',
    font: 'Helvetica',
    fontSize: 7,
    align: 'left',
    padding: 3,
    textColor: '#000000',
    ...options,
  };

  // Fill background
  if (fill) {
    doc.save();
    doc.rect(x, y, w, h).fill(fill);
    doc.restore();
  }

  // Border
  doc.save();
  doc.lineWidth(BORDER_WIDTH).rect(x, y, w, h).stroke(BORDER_COLOR);
  doc.restore();

  // Text
  if (text !== undefined && text !== null && text !== '') {
    doc.save();
    doc.font(font).fontSize(fontSize).fillColor(textColor);
    doc.text(String(text), x + padding, y + padding, {
      width: w - 2 * padding,
      align,
      lineBreak: false,
    });
    doc.restore();
  }
}

function drawRow(doc, y, rowHeight, values, options = {}) {
  const { fill, font, fontSize } = {
    fill: null,
    font: 'Helvetica',
    fontSize: 7,
    ...options,
  };

  const colKeys = ['sr', 'name', 'days', 'rate', 'amount', 'vatRate', 'vatAmt', 'total'];
  const aligns  = ['center', 'left', 'center', 'right', 'right', 'center', 'right', 'right'];

  colKeys.forEach((key, i) => {
    drawCell(doc, cols[key].x, y, cols[key].w, rowHeight, {
      fill,
      text: values[i] || '',
      font,
      fontSize,
      align: aligns[i],
    });
  });
}

// ── Main PDF Generator ───────────────────────────────────────────────────────

const generateInvoicePDF = (invoice, client, project, companySettings) => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: PAGE_MARGIN,
      bufferPages: true,
    });
    const buffers = [];

    doc.on('data', (chunk) => buffers.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);

    const settings = companySettings || {};
    let y = PAGE_MARGIN;

    // ══════════════════════════════════════════════════════════════════════════
    // SECTION 1 — Company Header
    // ══════════════════════════════════════════════════════════════════════════
    const headerHeight = 80;

    // Logo (left side)
    if (settings.logoBase64) {
      try {
        const logoBuffer = Buffer.from(settings.logoBase64, 'base64');
        doc.image(logoBuffer, PAGE_MARGIN, y, { width: 120, height: 70 });
      } catch (_) {
        // If logo fails to load, skip it
      }
    }

    // Company details (right side)
    const rightX = PAGE_MARGIN + 300;
    doc.save();
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#000000');
    doc.text(settings.companyName || 'Company Name', rightX, y, {
      width: 235,
      align: 'right',
    });

    doc.font('Helvetica').fontSize(8);
    const detailsY = y + 16;
    const lines = [
      settings.addressLine1 || '',
      settings.addressLine2 || '',
      settings.country || 'United Arab Emirates',
      settings.email ? `Email : ${settings.email}` : '',
      settings.trn ? `TRN No : ${settings.trn}` : '',
    ].filter(Boolean);

    lines.forEach((line, i) => {
      doc.text(line, rightX, detailsY + i * 11, { width: 235, align: 'right' });
    });
    doc.restore();

    y += headerHeight + 5;

    // ══════════════════════════════════════════════════════════════════════════
    // SECTION 2 — Title Bar ("Tax Invoice")
    // ══════════════════════════════════════════════════════════════════════════
    const titleBarHeight = 24;
    doc.save();
    doc.rect(PAGE_MARGIN, y, CONTENT_WIDTH, titleBarHeight).fill(BLUE);
    doc.restore();

    doc.save();
    doc.font('Helvetica-Bold').fontSize(16).fillColor('#000000');
    doc.text('Tax Invoice', PAGE_MARGIN, y + 4, {
      width: CONTENT_WIDTH,
      align: 'center',
    });
    doc.restore();

    y += titleBarHeight + 8;

    // ══════════════════════════════════════════════════════════════════════════
    // SECTION 3 — Invoice Metadata (2-column, 3-row grid)
    // ══════════════════════════════════════════════════════════════════════════
    const metaRowH = 18;
    const metaColW = CONTENT_WIDTH / 2;

    // Compute service period from/to
    let periodFrom = invoice.servicePeriodFrom;
    let periodTo = invoice.servicePeriodTo;
    if (!periodFrom && invoice.period) {
      periodFrom = new Date(invoice.period.year, invoice.period.month - 1, 1);
    }
    if (!periodTo && invoice.period) {
      periodTo = new Date(invoice.period.year, invoice.period.month, 0);
    }

    const metaData = [
      [`Invoice No: ${invoice.invoiceNo || ''}`, `Service Period From: ${formatDate(periodFrom)}`],
      [`Invoice Date: ${formatDate(invoice.issuedDate)}`, `Service Period To: ${formatDate(periodTo)}`],
      [`Document Currency: ${client?.billingCurrency || 'AED'}`, ''],
    ];

    metaData.forEach((row) => {
      row.forEach((text, colIdx) => {
        drawCell(doc, PAGE_MARGIN + colIdx * metaColW, y, metaColW, metaRowH, {
          text,
          font: 'Helvetica-Bold',
          fontSize: 8,
          padding: 4,
        });
      });
      y += metaRowH;
    });

    y += 6;

    // ══════════════════════════════════════════════════════════════════════════
    // SECTION 4 — "Invoiced To" Section
    // ══════════════════════════════════════════════════════════════════════════
    const invToHeaderH = 18;
    drawCell(doc, PAGE_MARGIN, y, CONTENT_WIDTH, invToHeaderH, {
      fill: BLUE,
      text: 'Invoiced To',
      font: 'Helvetica-Bold',
      fontSize: 9,
      align: 'center',
    });
    y += invToHeaderH;

    const projectName = project?.name || (invoice.projectId?.name) || '';
    const clientAddress = client?.address || '';
    const clientTrn = client?.vatNo || '';

    const invToRows = [
      `Client : ${client?.name || ''}`,
      `Project : ${projectName}`,
      `Address : ${clientAddress}`,
      `Client TRN : ${clientTrn}`,
    ];

    invToRows.forEach((text) => {
      drawCell(doc, PAGE_MARGIN, y, CONTENT_WIDTH, 16, {
        text,
        font: 'Helvetica',
        fontSize: 8,
        padding: 4,
      });
      y += 16;
    });

    y += 6;

    // ══════════════════════════════════════════════════════════════════════════
    // SECTION 5 — Line Items Table
    // ══════════════════════════════════════════════════════════════════════════
    const headerRowH = 16;
    const subHeaderRowH = 22;
    const dataRowH = 14;

    // --- Spanning header row ---
    // "DESCRIPTION" spans sr + name + days + rate + amount (5 cols)
    const descSpanW = cols.sr.w + cols.name.w + cols.days.w + cols.rate.w + cols.amount.w;
    drawCell(doc, cols.sr.x, y, descSpanW, headerRowH, {
      fill: BLUE,
      text: 'DESCRIPTION',
      font: 'Helvetica-Bold',
      fontSize: 8,
      align: 'center',
    });

    // "VAT" spans vatRate + vatAmt (2 cols)
    const vatSpanW = cols.vatRate.w + cols.vatAmt.w;
    drawCell(doc, cols.vatRate.x, y, vatSpanW, headerRowH, {
      fill: BLUE,
      text: 'VAT',
      font: 'Helvetica-Bold',
      fontSize: 8,
      align: 'center',
    });

    // "Total (In AED)"
    drawCell(doc, cols.total.x, y, cols.total.w, headerRowH, {
      fill: BLUE,
      text: 'Total (In AED)',
      font: 'Helvetica-Bold',
      fontSize: 6.5,
      align: 'center',
    });

    y += headerRowH;

    // --- Sub-header row ---
    const subHeaders = ['Sr.', 'Name of Employee / Driver', 'Payable Days', 'Rate', 'Amount', 'Rate', 'Amount', 'Total (In AED)'];
    const subFontSizes = [6, 6.5, 6, 6, 6, 6, 6, 5.5];
    const subAligns = ['center', 'center', 'center', 'center', 'center', 'center', 'center', 'center'];
    const colKeys = ['sr', 'name', 'days', 'rate', 'amount', 'vatRate', 'vatAmt', 'total'];

    colKeys.forEach((key, i) => {
      drawCell(doc, cols[key].x, y, cols[key].w, subHeaderRowH, {
        fill: BLUE,
        text: subHeaders[i],
        font: 'Helvetica-Bold',
        fontSize: subFontSizes[i],
        align: subAligns[i],
        padding: 2,
      });
    });

    y += subHeaderRowH;

    // --- Data rows ---
    const lineItems = invoice.lineItems || [];
    const MIN_ROWS = 20;
    const totalRows = Math.max(lineItems.length, MIN_ROWS);

    let sumDays = 0;
    let sumAmount = 0;
    let sumVatAmount = 0;
    let sumTotal = 0;

    // Check if we need page overflow
    const availableHeight = 842 - PAGE_MARGIN - 180; // A4 height minus margins minus footer space

    for (let i = 0; i < totalRows; i++) {
      // Page overflow check
      if (y + dataRowH > availableHeight && i < lineItems.length) {
        // Add a new page and re-draw headers
        doc.addPage();
        y = PAGE_MARGIN;

        // Re-draw column headers on new page
        drawCell(doc, cols.sr.x, y, descSpanW, headerRowH, {
          fill: BLUE, text: 'DESCRIPTION', font: 'Helvetica-Bold', fontSize: 8, align: 'center',
        });
        drawCell(doc, cols.vatRate.x, y, vatSpanW, headerRowH, {
          fill: BLUE, text: 'VAT', font: 'Helvetica-Bold', fontSize: 8, align: 'center',
        });
        drawCell(doc, cols.total.x, y, cols.total.w, headerRowH, {
          fill: BLUE, text: 'Total (In AED)', font: 'Helvetica-Bold', fontSize: 6.5, align: 'center',
        });
        y += headerRowH;

        colKeys.forEach((key, idx) => {
          drawCell(doc, cols[key].x, y, cols[key].w, subHeaderRowH, {
            fill: BLUE, text: subHeaders[idx], font: 'Helvetica-Bold',
            fontSize: subFontSizes[idx], align: subAligns[idx], padding: 2,
          });
        });
        y += subHeaderRowH;
      }

      if (i < lineItems.length) {
        const item = lineItems[i];
        const days = item.workingDays || 0;
        const rate = item.ratePerDriver || item.ratePerDay || item.dailyRate || 0;
        const amt = item.amount || 0;
        const vatPct = (item.vatRate || 0.05) * 100;
        const vatAmt = item.vatAmount != null ? item.vatAmount : parseFloat((amt * 0.05).toFixed(2));
        const rowTotal = item.totalWithVat != null ? item.totalWithVat : parseFloat((amt + vatAmt).toFixed(2));

        sumDays += days;
        sumAmount += amt;
        sumVatAmount += vatAmt;
        sumTotal += rowTotal;

        drawRow(doc, y, dataRowH, [
          String(i + 1),
          item.driverName || '',
          days.toFixed(2),
          formatCurrency(rate),
          formatCurrency(amt),
          `${vatPct}%`,
          formatCurrency(vatAmt),
          formatCurrency(rowTotal),
        ]);
      } else {
        // Empty row — still draw bordered cells for formal ledger look
        drawRow(doc, y, dataRowH, ['', '', '', '', '', '', '', '']);
      }

      y += dataRowH;
    }

    // --- Totals row ---
    const totalsRowH = 16;
    drawRow(doc, y, totalsRowH, [
      '',
      'Total',
      sumDays.toFixed(2),
      '',
      formatCurrency(sumAmount),
      '',
      formatCurrency(sumVatAmount),
      formatCurrency(sumTotal),
    ], { font: 'Helvetica-Bold', fontSize: 7 });

    y += totalsRowH + 6;

    // ══════════════════════════════════════════════════════════════════════════
    // SECTION 6 — Summary Block (Amount in Words + right-aligned totals)
    // ══════════════════════════════════════════════════════════════════════════
    const summaryRowH = 16;
    const wordsColW = CONTENT_WIDTH - 170;
    const labelColW = 70;
    const valueColW = 100;
    const labelX = PAGE_MARGIN + wordsColW;
    const valueX = labelX + labelColW;

    // Row 1: Amount in Words label | AMOUNT | value
    drawCell(doc, PAGE_MARGIN, y, wordsColW, summaryRowH, {
      text: 'Amount in Words',
      font: 'Helvetica-Bold',
      fontSize: 8,
      padding: 4,
    });
    drawCell(doc, labelX, y, labelColW, summaryRowH, {
      text: 'AMOUNT',
      font: 'Helvetica-Bold',
      fontSize: 8,
      align: 'center',
      padding: 4,
    });
    drawCell(doc, valueX, y, valueColW, summaryRowH, {
      text: formatCurrency(invoice.subtotal || sumAmount),
      font: 'Helvetica',
      fontSize: 8,
      align: 'right',
      padding: 4,
    });
    y += summaryRowH;

    // Row 2: Amount words text (italic) | VAT | value
    const totalAmount = invoice.total || sumTotal;
    const wordsText = amountToWords(totalAmount);
    drawCell(doc, PAGE_MARGIN, y, wordsColW, summaryRowH, {
      text: wordsText,
      font: 'Helvetica-Oblique',
      fontSize: 7,
      padding: 4,
    });
    drawCell(doc, labelX, y, labelColW, summaryRowH, {
      text: 'VAT',
      font: 'Helvetica-Bold',
      fontSize: 8,
      align: 'center',
      padding: 4,
    });
    drawCell(doc, valueX, y, valueColW, summaryRowH, {
      text: formatCurrency(invoice.vatAmount || sumVatAmount),
      font: 'Helvetica',
      fontSize: 8,
      align: 'right',
      padding: 4,
    });
    y += summaryRowH;

    // Row 3: (empty) | TOTAL | value
    drawCell(doc, PAGE_MARGIN, y, wordsColW, summaryRowH, { text: '' });
    drawCell(doc, labelX, y, labelColW, summaryRowH, {
      text: 'TOTAL',
      font: 'Helvetica-Bold',
      fontSize: 9,
      align: 'center',
      padding: 4,
    });
    drawCell(doc, valueX, y, valueColW, summaryRowH, {
      text: formatCurrency(totalAmount),
      font: 'Helvetica-Bold',
      fontSize: 9,
      align: 'right',
      padding: 4,
    });
    y += summaryRowH + 10;

    // ══════════════════════════════════════════════════════════════════════════
    // SECTION 7 — Footer (Bank Details | Stamp | Signatory)
    // ══════════════════════════════════════════════════════════════════════════
    const footerY = y;
    const footerColW = CONTENT_WIDTH / 3;

    // Left column: Bank Account Details
    doc.save();
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#000000');
    doc.text('Bank Account Details :-', PAGE_MARGIN, footerY);
    doc.font('Helvetica').fontSize(7);
    const bankLines = [
      settings.bankAccountName || '',
      settings.bankName || '',
      settings.bankAccountNo ? `A/c - ${settings.bankAccountNo}` : '',
      settings.bankIban ? `IBAN - ${settings.bankIban}` : '',
    ].filter(Boolean);
    bankLines.forEach((line, i) => {
      doc.text(line, PAGE_MARGIN, footerY + 14 + i * 11);
    });
    doc.restore();

    // Center column: Company stamp
    const stampX = PAGE_MARGIN + footerColW + 20;
    if (settings.stampBase64) {
      try {
        const stampBuffer = Buffer.from(settings.stampBase64, 'base64');
        doc.image(stampBuffer, stampX, footerY, { width: 100, height: 60 });
      } catch (_) {
        // Skip if stamp fails
      }
    }

    // Right column: Authorized Signatory
    const sigX = PAGE_MARGIN + footerColW * 2 + 10;
    const sigW = footerColW - 10;
    doc.save();
    doc.font('Helvetica').fontSize(7).fillColor('#000000');
    doc.text('For', sigX, footerY, { width: sigW, align: 'center' });
    doc.font('Helvetica-Bold').fontSize(8);
    doc.text(settings.companyName || '', sigX, footerY + 11, { width: sigW, align: 'center' });

    // Signature image
    if (settings.signatureBase64) {
      try {
        const sigBuffer = Buffer.from(settings.signatureBase64, 'base64');
        doc.image(sigBuffer, sigX + 30, footerY + 25, { width: 80, height: 30 });
      } catch (_) {
        // Skip if signature fails
      }
    }

    // Line above "Authorised Signatory"
    const sigLineY = footerY + 58;
    doc.save();
    doc.lineWidth(0.5)
      .moveTo(sigX + 10, sigLineY)
      .lineTo(sigX + sigW - 10, sigLineY)
      .stroke('#000000');
    doc.restore();

    doc.font('Helvetica').fontSize(7);
    doc.text('Authorised Signatory', sigX, sigLineY + 3, { width: sigW, align: 'center' });
    doc.restore();

    // ══════════════════════════════════════════════════════════════════════════
    // SECTION 8 — Dispute Notice
    // ══════════════════════════════════════════════════════════════════════════
    const disputeDays = settings.disputeNoticeDays || 7;
    const disputeY = footerY + 78;
    doc.save();
    doc.font('Helvetica').fontSize(7).fillColor('#000000');
    doc.text(
      `*Any dispute to be notified in writing with in ${disputeDays} days`,
      PAGE_MARGIN,
      disputeY
    );
    doc.restore();

    doc.end();
  });
};

module.exports = { generateInvoicePDF };
