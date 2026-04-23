const PDFDocument = require('pdfkit');
const { amountToWords } = require('./numberToWords');
const logger = require('./logger');

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
  sr:           { x: TABLE_LEFT,       w: 25  },
  name:         { x: TABLE_LEFT + 25,  w: 145 },
  clientUserId: { x: TABLE_LEFT + 170, w: 60  },
  days:         { x: TABLE_LEFT + 230, w: 50  },
  rate:         { x: TABLE_LEFT + 280, w: 50  },
  amount:       { x: TABLE_LEFT + 330, w: 65  },
  vatRate:      { x: TABLE_LEFT + 395, w: 38  },
  vatAmt:       { x: TABLE_LEFT + 433, w: 55  },
  total:        { x: TABLE_LEFT + 488, w: 47  },
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

  const colKeys = ['sr', 'name', 'clientUserId', 'days', 'rate', 'amount', 'vatRate', 'vatAmt', 'total'];
  const aligns  = ['center', 'left', 'left', 'center', 'right', 'right', 'center', 'right', 'right'];

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
      } catch (err) {
        logger.warn('Non-critical operation failed', { error: err.message });
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

    // Determine pay structure from line items to choose column header
    const lineItems = invoice.lineItems || [];
    const invoiceRateBasis = lineItems.length > 0 ? (lineItems[0].rateBasis || 'monthly_fixed') : 'monthly_fixed';
    const isPerOrder = invoiceRateBasis === 'per_order';
    const daysColumnHeader = isPerOrder ? 'Total Orders' : 'Payable Days';
    const rateColumnHeader = isPerOrder ? 'Rate/Order' : 'Rate/Day';

    // --- Spanning header row ---
    // "DESCRIPTION" spans sr + name + clientUserId + days + rate + amount (6 cols)
    const descSpanW = cols.sr.w + cols.name.w + cols.clientUserId.w + cols.days.w + cols.rate.w + cols.amount.w;
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
    const subHeaders = ['Sr.', 'Name of Employee / Driver', 'Client User ID', daysColumnHeader, rateColumnHeader, 'Amount', 'Rate', 'Amount', 'Total (In AED)'];
    const subFontSizes = [6, 6.5, 5.5, 6, 6, 6, 6, 6, 5.5];
    const subAligns = ['center', 'center', 'center', 'center', 'center', 'center', 'center', 'center', 'center'];
    const colKeys = ['sr', 'name', 'clientUserId', 'days', 'rate', 'amount', 'vatRate', 'vatAmt', 'total'];

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
    const MIN_ROWS = 20;
    const totalRows = Math.max(lineItems.length, MIN_ROWS);

    let sumDaysOrOrders = 0;
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
        const orders = item.totalOrders || 0;
        const daysOrOrders = isPerOrder ? orders : days;
        const rate = item.ratePerDriver || project?.ratePerDriver || item.ratePerDay || item.dailyRate || 0;
        const amt = item.amount || 0;
        const vatPct = (item.vatRate || 0.05) * 100;
        const vatAmt = item.vatAmount != null ? item.vatAmount : parseFloat((amt * 0.05).toFixed(2));
        const rowTotal = item.totalWithVat != null ? item.totalWithVat : parseFloat((amt + vatAmt).toFixed(2));

        sumDaysOrOrders += daysOrOrders;
        sumAmount += amt;
        sumVatAmount += vatAmt;
        sumTotal += rowTotal;

        const driverLabel = item.driverName || '';
        const clientUserIdVal = item.driverId?.clientUserId || '';

        drawRow(doc, y, dataRowH, [
          String(i + 1),
          driverLabel,
          clientUserIdVal,
          isPerOrder ? String(daysOrOrders) : daysOrOrders.toFixed(2),
          formatCurrency(rate),
          formatCurrency(amt),
          `${vatPct}%`,
          formatCurrency(vatAmt),
          formatCurrency(rowTotal),
        ]);
      } else {
        // Empty row — still draw bordered cells for formal ledger look
        drawRow(doc, y, dataRowH, ['', '', '', '', '', '', '', '', '']);
      }

      y += dataRowH;
    }

    // --- Totals row ---
    const totalsRowH = 16;
    drawRow(doc, y, totalsRowH, [
      '',
      'Total',
      '',
      isPerOrder ? String(sumDaysOrOrders) : sumDaysOrOrders.toFixed(2),
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
      } catch (err) {
        logger.warn('Non-critical operation failed', { error: err.message });
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
      } catch (err) {
        logger.warn('Non-critical operation failed', { error: err.message });
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

// ── Payslip PDF Generator ───────────────────────────────────────────────────

const PAYSLIP_ACCENT = '#1a56db';
const PAYSLIP_LIGHT = '#e8edf5';
const PAYSLIP_BORDER = '#c4cdd5';

const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function drawPayslipCell(doc, x, y, w, h, options = {}) {
  const { fill, text, font, fontSize, align, padding, textColor, borderColor } = {
    fill: null, text: '', font: 'Helvetica', fontSize: 8,
    align: 'left', padding: 4, textColor: '#000000', borderColor: PAYSLIP_BORDER,
    ...options,
  };
  if (fill) { doc.save(); doc.rect(x, y, w, h).fill(fill); doc.restore(); }
  doc.save(); doc.lineWidth(0.5).rect(x, y, w, h).stroke(borderColor); doc.restore();
  if (text !== undefined && text !== null && text !== '') {
    doc.save(); doc.font(font).fontSize(fontSize).fillColor(textColor);
    doc.text(String(text), x + padding, y + padding, { width: w - 2 * padding, align, lineBreak: false });
    doc.restore();
  }
}

const generatePayslipPDF = (salaryRun, driver, project, client, companySettings) => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: PAGE_MARGIN, bufferPages: true });
    const buffers = [];
    doc.on('data', (chunk) => buffers.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);

    const settings = companySettings || {};
    let y = PAGE_MARGIN;
    const CW = CONTENT_WIDTH;
    const halfW = CW / 2;

    // ═══════════════════════════════════════════════════════════════════
    // HEADER — Company Logo + Name
    // ═══════════════════════════════════════════════════════════════════
    if (settings.logoBase64) {
      try {
        const logoBuffer = Buffer.from(settings.logoBase64, 'base64');
        doc.image(logoBuffer, PAGE_MARGIN, y, { width: 100, height: 50 });
      } catch (err) {
        logger.warn('Non-critical operation failed', { error: err.message });
      }
    }

    doc.save();
    doc.font('Helvetica-Bold').fontSize(12).fillColor(PAYSLIP_ACCENT);
    doc.text(settings.companyName || 'Company Name', PAGE_MARGIN + 110, y + 5, { width: CW - 110 });
    doc.font('Helvetica').fontSize(7).fillColor('#555555');
    const addr = [settings.addressLine1, settings.addressLine2, settings.country].filter(Boolean).join(', ');
    doc.text(addr, PAGE_MARGIN + 110, y + 22, { width: CW - 110 });
    if (settings.email) doc.text(`Email: ${settings.email}`, PAGE_MARGIN + 110, y + 33, { width: CW - 110 });
    if (settings.trn) doc.text(`TRN: ${settings.trn}`, PAGE_MARGIN + 110, y + 44, { width: CW - 110 });
    doc.restore();

    y += 60;

    // ═══════════════════════════════════════════════════════════════════
    // TITLE BAR
    // ═══════════════════════════════════════════════════════════════════
    doc.save();
    doc.rect(PAGE_MARGIN, y, CW, 24).fill(PAYSLIP_ACCENT);
    doc.font('Helvetica-Bold').fontSize(13).fillColor('#ffffff');
    const periodLabel = salaryRun.period
      ? `${monthNames[(salaryRun.period.month || 1) - 1] || ''} ${salaryRun.period.year || ''}`
      : '';
    doc.text(`PAYSLIP — ${periodLabel}`, PAGE_MARGIN, y + 5, { width: CW, align: 'center' });
    doc.restore();
    y += 32;

    // ═══════════════════════════════════════════════════════════════════
    // EMPLOYEE DETAILS — 2-column grid
    // ═══════════════════════════════════════════════════════════════════
    const detailRowH = 18;
    const labelW = 120;
    const valueW = halfW - labelW;

    const employeeDetails = [
      ['Employee Name', driver?.fullName || '—', 'Employee Code', driver?.employeeCode || '—'],
      ['Project', project?.name || '—', 'Client', client?.name || '—'],
      ['Pay Structure', (driver?.payStructure || '—').replace(/_/g, ' '), 'Payslip No', salaryRun.runId || '—'],
      ['Bank Name', driver?.bankName || '—', 'IBAN', driver?.iban || '—'],
      ['Working Days', String(salaryRun.workingDays ?? '—'), 'Overtime Hours', String(salaryRun.overtimeHours ?? 0)],
    ];

    // Section header
    drawPayslipCell(doc, PAGE_MARGIN, y, CW, 18, {
      fill: PAYSLIP_LIGHT, text: 'Employee Details', font: 'Helvetica-Bold', fontSize: 9,
      textColor: PAYSLIP_ACCENT, padding: 6,
    });
    y += 18;

    employeeDetails.forEach((row) => {
      // Left pair
      drawPayslipCell(doc, PAGE_MARGIN, y, labelW, detailRowH, {
        fill: '#f7f8fa', text: row[0], font: 'Helvetica-Bold', fontSize: 7.5, textColor: '#444',
      });
      drawPayslipCell(doc, PAGE_MARGIN + labelW, y, valueW, detailRowH, {
        text: row[1], fontSize: 7.5,
      });
      // Right pair
      drawPayslipCell(doc, PAGE_MARGIN + halfW, y, labelW, detailRowH, {
        fill: '#f7f8fa', text: row[2], font: 'Helvetica-Bold', fontSize: 7.5, textColor: '#444',
      });
      drawPayslipCell(doc, PAGE_MARGIN + halfW + labelW, y, valueW, detailRowH, {
        text: row[3], fontSize: 7.5,
      });
      y += detailRowH;
    });

    y += 10;

    // ═══════════════════════════════════════════════════════════════════
    // EARNINGS & DEDUCTIONS — Side by side
    // ═══════════════════════════════════════════════════════════════════
    const colW = halfW - 4;
    const rowH = 16;

    // ── Earnings (left) ──
    const earningsX = PAGE_MARGIN;
    let ey = y;

    drawPayslipCell(doc, earningsX, ey, colW, 20, {
      fill: PAYSLIP_ACCENT, text: 'EARNINGS', font: 'Helvetica-Bold', fontSize: 9,
      textColor: '#ffffff', align: 'center',
    });
    ey += 20;

    // Column headers
    drawPayslipCell(doc, earningsX, ey, colW * 0.6, rowH, {
      fill: PAYSLIP_LIGHT, text: 'Description', font: 'Helvetica-Bold', fontSize: 7.5,
    });
    drawPayslipCell(doc, earningsX + colW * 0.6, ey, colW * 0.4, rowH, {
      fill: PAYSLIP_LIGHT, text: 'Amount (AED)', font: 'Helvetica-Bold', fontSize: 7.5, align: 'right',
    });
    ey += rowH;

    // Earnings rows
    const earningsItems = [
      { desc: 'Base Salary', amt: salaryRun.baseSalary || 0 },
      { desc: 'Prorated Salary', amt: salaryRun.proratedSalary || 0 },
      { desc: 'Overtime Pay', amt: salaryRun.overtimePay || 0 },
    ];

    // Add allowances
    if (salaryRun.allowances && salaryRun.allowances.length > 0) {
      salaryRun.allowances.forEach((a) => {
        const label = (a.type || 'Allowance').replace(/_/g, ' ');
        earningsItems.push({ desc: label.charAt(0).toUpperCase() + label.slice(1) + ' Allowance', amt: a.amount || 0 });
      });
    }

    earningsItems.forEach((item) => {
      drawPayslipCell(doc, earningsX, ey, colW * 0.6, rowH, {
        text: item.desc, fontSize: 7.5,
      });
      drawPayslipCell(doc, earningsX + colW * 0.6, ey, colW * 0.4, rowH, {
        text: formatCurrency(item.amt), fontSize: 7.5, align: 'right',
      });
      ey += rowH;
    });

    // Gross total
    drawPayslipCell(doc, earningsX, ey, colW * 0.6, rowH, {
      fill: PAYSLIP_LIGHT, text: 'GROSS SALARY', font: 'Helvetica-Bold', fontSize: 8,
    });
    drawPayslipCell(doc, earningsX + colW * 0.6, ey, colW * 0.4, rowH, {
      fill: PAYSLIP_LIGHT, text: formatCurrency(salaryRun.grossSalary || 0),
      font: 'Helvetica-Bold', fontSize: 8, align: 'right',
    });
    ey += rowH;

    // ── Deductions (right) ──
    const deductionsX = PAGE_MARGIN + halfW + 4;
    let dy = y;

    drawPayslipCell(doc, deductionsX, dy, colW, 20, {
      fill: '#dc2626', text: 'DEDUCTIONS', font: 'Helvetica-Bold', fontSize: 9,
      textColor: '#ffffff', align: 'center',
    });
    dy += 20;

    drawPayslipCell(doc, deductionsX, dy, colW * 0.6, rowH, {
      fill: PAYSLIP_LIGHT, text: 'Description', font: 'Helvetica-Bold', fontSize: 7.5,
    });
    drawPayslipCell(doc, deductionsX + colW * 0.6, dy, colW * 0.4, rowH, {
      fill: PAYSLIP_LIGHT, text: 'Amount (AED)', font: 'Helvetica-Bold', fontSize: 7.5, align: 'right',
    });
    dy += rowH;

    const deductionItems = (salaryRun.deductions || []).filter((d) => d.amount > 0);

    if (deductionItems.length === 0) {
      drawPayslipCell(doc, deductionsX, dy, colW, rowH, {
        text: 'No deductions', fontSize: 7.5, textColor: '#888',
      });
      dy += rowH;
    } else {
      deductionItems.forEach((d) => {
        const label = d.description || (d.type || 'Deduction').replace(/_/g, ' ');
        drawPayslipCell(doc, deductionsX, dy, colW * 0.6, rowH, {
          text: label, fontSize: 7.5,
        });
        drawPayslipCell(doc, deductionsX + colW * 0.6, dy, colW * 0.4, rowH, {
          text: formatCurrency(d.amount), fontSize: 7.5, align: 'right', textColor: '#dc2626',
        });
        dy += rowH;
      });
    }

    // Total deductions
    drawPayslipCell(doc, deductionsX, dy, colW * 0.6, rowH, {
      fill: PAYSLIP_LIGHT, text: 'TOTAL DEDUCTIONS', font: 'Helvetica-Bold', fontSize: 8,
    });
    drawPayslipCell(doc, deductionsX + colW * 0.6, dy, colW * 0.4, rowH, {
      fill: PAYSLIP_LIGHT, text: formatCurrency(salaryRun.totalDeductions || 0),
      font: 'Helvetica-Bold', fontSize: 8, align: 'right', textColor: '#dc2626',
    });
    dy += rowH;

    // Advance y to the bottom of whichever column is taller
    y = Math.max(ey, dy) + 14;

    // ═══════════════════════════════════════════════════════════════════
    // NET SALARY BAR
    // ═══════════════════════════════════════════════════════════════════
    doc.save();
    doc.rect(PAGE_MARGIN, y, CW, 28).fill(PAYSLIP_ACCENT);
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#ffffff');
    doc.text('NET SALARY', PAGE_MARGIN + 10, y + 7);
    doc.text(`AED ${formatCurrency(salaryRun.netSalary || 0)}`, PAGE_MARGIN, y + 7, {
      width: CW - 10, align: 'right',
    });
    doc.restore();
    y += 36;

    // Amount in words
    const wordsText = amountToWords(salaryRun.netSalary || 0);
    doc.save();
    doc.font('Helvetica-Oblique').fontSize(8).fillColor('#333');
    doc.text(`Amount in words: ${wordsText}`, PAGE_MARGIN, y, { width: CW });
    doc.restore();
    y += 20;

    // ═══════════════════════════════════════════════════════════════════
    // NOTES (if any)
    // ═══════════════════════════════════════════════════════════════════
    if (salaryRun.notes) {
      drawPayslipCell(doc, PAGE_MARGIN, y, CW, 16, {
        fill: '#fffbeb', text: 'Notes', font: 'Helvetica-Bold', fontSize: 8, textColor: '#92400e',
      });
      y += 16;
      drawPayslipCell(doc, PAGE_MARGIN, y, CW, 24, {
        text: salaryRun.notes, fontSize: 7.5, textColor: '#555',
      });
      y += 32;
    }

    // ═══════════════════════════════════════════════════════════════════
    // FOOTER — Bank Details & Signature
    // ═══════════════════════════════════════════════════════════════════
    y = Math.max(y, 680); // push footer to bottom area

    doc.save();
    doc.lineWidth(0.5).moveTo(PAGE_MARGIN, y).lineTo(PAGE_MARGIN + CW, y).stroke(PAYSLIP_BORDER);
    doc.restore();
    y += 8;

    // Bank details
    doc.save();
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#333');
    doc.text('Payment Bank Details:', PAGE_MARGIN, y);
    doc.font('Helvetica').fontSize(7).fillColor('#555');
    doc.text(`${settings.bankName || ''} | A/C: ${settings.bankAccountNo || ''} | IBAN: ${settings.bankIban || ''}`, PAGE_MARGIN, y + 12, { width: CW * 0.6 });
    doc.restore();

    // Signature
    const sigX = PAGE_MARGIN + CW * 0.65;
    if (settings.signatureBase64) {
      try {
        const sigBuffer = Buffer.from(settings.signatureBase64, 'base64');
        doc.image(sigBuffer, sigX + 20, y - 5, { width: 70, height: 25 });
      } catch (err) {
        logger.warn('Non-critical operation failed', { error: err.message });
      }
    }
    doc.save();
    doc.lineWidth(0.5).moveTo(sigX, y + 25).lineTo(sigX + 120, y + 25).stroke('#000');
    doc.font('Helvetica').fontSize(7).fillColor('#333');
    doc.text('Authorised Signatory', sigX, y + 28, { width: 120, align: 'center' });
    doc.restore();

    // Disclaimer
    y += 48;
    doc.save();
    doc.font('Helvetica').fontSize(6).fillColor('#999');
    doc.text('This is a computer-generated payslip and does not require a physical signature.', PAGE_MARGIN, y, { width: CW, align: 'center' });
    doc.restore();

    doc.end();
  });
};

// ── Credit Note PDF Generator ─────────────────────────────────────────────────

// Column layout for credit note line items
const CN_TABLE_LEFT = PAGE_MARGIN;
const cnCols = {
  sl:      { x: CN_TABLE_LEFT,       w: 25  },
  type:    { x: CN_TABLE_LEFT + 25,  w: 55  },
  daName:  { x: CN_TABLE_LEFT + 80,  w: 170 },
  empId:   { x: CN_TABLE_LEFT + 250, w: 50  },
  refNo:   { x: CN_TABLE_LEFT + 300, w: 75  },
  amount:  { x: CN_TABLE_LEFT + 375, w: 55  },
  vat:     { x: CN_TABLE_LEFT + 430, w: 50  },
  total:   { x: CN_TABLE_LEFT + 480, w: 55  },
};

function drawCNRow(doc, y, rowHeight, values, options = {}) {
  const { fill, font, fontSize } = {
    fill: null,
    font: 'Helvetica',
    fontSize: 7,
    ...options,
  };

  const colKeys = ['sl', 'type', 'daName', 'empId', 'refNo', 'amount', 'vat', 'total'];
  const aligns  = ['center', 'center', 'left', 'center', 'left', 'right', 'right', 'right'];

  colKeys.forEach((key, i) => {
    drawCell(doc, cnCols[key].x, y, cnCols[key].w, rowHeight, {
      fill,
      text: values[i] || '',
      font,
      fontSize,
      align: aligns[i],
    });
  });
}

const generateCreditNotePDF = (creditNote, client, project, companySettings) => {
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

    if (settings.logoBase64) {
      try {
        const logoBuffer = Buffer.from(settings.logoBase64, 'base64');
        doc.image(logoBuffer, PAGE_MARGIN, y, { width: 120, height: 70 });
      } catch (err) {
        logger.warn('Non-critical operation failed', { error: err.message });
      }
    }

    const rightX = PAGE_MARGIN + 300;
    doc.save();
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#000000');
    doc.text(settings.companyName || 'Company Name', rightX, y, { width: 235, align: 'right' });

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
    // SECTION 2 — Title Bar ("CREDIT NOTE")
    // ══════════════════════════════════════════════════════════════════════════
    const titleBarHeight = 24;
    doc.save();
    doc.rect(PAGE_MARGIN, y, CONTENT_WIDTH, titleBarHeight).fill(BLUE);
    doc.restore();

    doc.save();
    doc.font('Helvetica-Bold').fontSize(16).fillColor('#000000');
    doc.text('CREDIT NOTE', PAGE_MARGIN, y + 4, { width: CONTENT_WIDTH, align: 'center' });
    doc.restore();

    y += titleBarHeight + 8;

    // ══════════════════════════════════════════════════════════════════════════
    // SECTION 3 — Info Table (2-column)
    // ══════════════════════════════════════════════════════════════════════════
    const metaRowH = 18;
    const metaColW = CONTENT_WIDTH / 2;
    const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];

    const deductionMonth = creditNote.period
      ? `${monthNames[(creditNote.period.month || 1) - 1]} ${creditNote.period.year}`
      : '';

    const metaRows = [
      [`Customer : ${client?.name || ''}`, `Credit Note No : ${creditNote.creditNoteNo || ''}`],
      [`Customer TRN No : ${client?.vatNo || ''}`, `Credit Note Date : ${formatDate(creditNote.createdAt)}`],
      [`Address : ${client?.address || ''}`, `Document Currency : AED`],
      [`Description : ${creditNote.description || ''}`, `Deduction Month : ${deductionMonth}`],
    ];

    metaRows.forEach((row) => {
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
    // SECTION 4 — Line Items Table
    // ══════════════════════════════════════════════════════════════════════════
    const headerRowH = 16;
    const dataRowH = 14;

    // Column headers
    const cnHeaders = ['Sl No', 'Type', 'DA ID / DA Name / Description', 'EMP ID', 'Reference / Plate No', 'Amount', 'VAT', 'TOTAL'];
    const cnColKeys = ['sl', 'type', 'daName', 'empId', 'refNo', 'amount', 'vat', 'total'];
    const cnAligns = ['center', 'center', 'center', 'center', 'center', 'center', 'center', 'center'];

    cnColKeys.forEach((key, i) => {
      drawCell(doc, cnCols[key].x, y, cnCols[key].w, headerRowH, {
        fill: BLUE,
        text: cnHeaders[i],
        font: 'Helvetica-Bold',
        fontSize: 6.5,
        align: cnAligns[i],
        padding: 2,
      });
    });

    y += headerRowH;

    // Data rows
    const lineItems = creditNote.lineItems || [];
    const MIN_ROWS = 20;
    const totalRows = Math.max(lineItems.length, MIN_ROWS);
    const availableHeight = 842 - PAGE_MARGIN - 180;

    let sumAmount = 0;
    let sumVat = 0;
    let sumTotal = 0;

    for (let i = 0; i < totalRows; i++) {
      // Page overflow check
      if (y + dataRowH > availableHeight && i < lineItems.length) {
        doc.addPage();
        y = PAGE_MARGIN;

        cnColKeys.forEach((key, idx) => {
          drawCell(doc, cnCols[key].x, y, cnCols[key].w, headerRowH, {
            fill: BLUE, text: cnHeaders[idx], font: 'Helvetica-Bold',
            fontSize: 6.5, align: cnAligns[idx], padding: 2,
          });
        });
        y += headerRowH;
      }

      if (i < lineItems.length) {
        const item = lineItems[i];
        const daName = item.driverName || '';
        const lineTypeLabel = (item.noteType || '').replace(/_/g, ' ');

        sumAmount += item.amount || 0;
        sumVat += item.vatAmount || 0;
        sumTotal += item.totalWithVat || 0;

        drawCNRow(doc, y, dataRowH, [
          String(i + 1),
          lineTypeLabel,
          daName,
          item.clientUserId || '',
          item.referenceNo || '',
          formatCurrency(item.amount || 0),
          formatCurrency(item.vatAmount || 0),
          formatCurrency(item.totalWithVat || 0),
        ]);
      } else {
        drawCNRow(doc, y, dataRowH, ['', '', '', '', '', '', '', '']);
      }

      y += dataRowH;
    }

    // Totals row
    const totalsRowH = 16;
    drawCNRow(doc, y, totalsRowH, [
      '',
      '',
      'Total',
      '',
      '',
      formatCurrency(sumAmount),
      formatCurrency(sumVat),
      formatCurrency(sumTotal),
    ], { font: 'Helvetica-Bold', fontSize: 7 });

    y += totalsRowH + 6;

    // ══════════════════════════════════════════════════════════════════════════
    // SECTION 5 — Summary Block (Amount in Words + totals)
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
      text: formatCurrency(creditNote.subtotal || sumAmount),
      font: 'Helvetica',
      fontSize: 8,
      align: 'right',
      padding: 4,
    });
    y += summaryRowH;

    // Row 2: Amount words text | VAT | value
    const wordsText = creditNote.amountInWords || amountToWords(creditNote.totalAmount || sumTotal);
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
      text: formatCurrency(creditNote.totalVat || sumVat),
      font: 'Helvetica',
      fontSize: 8,
      align: 'right',
      padding: 4,
    });
    y += summaryRowH;

    // Row 3: (empty) | TOTAL AMOUNT | value
    drawCell(doc, PAGE_MARGIN, y, wordsColW, summaryRowH, { text: '' });
    drawCell(doc, labelX, y, labelColW, summaryRowH, {
      text: 'TOTAL AMOUNT',
      font: 'Helvetica-Bold',
      fontSize: 8,
      align: 'center',
      padding: 4,
    });
    drawCell(doc, valueX, y, valueColW, summaryRowH, {
      text: formatCurrency(creditNote.totalAmount || sumTotal),
      font: 'Helvetica-Bold',
      fontSize: 9,
      align: 'right',
      padding: 4,
    });
    y += summaryRowH + 10;

    // ══════════════════════════════════════════════════════════════════════════
    // SECTION 6 — Footer (Stamp + Prepared By / Received By)
    // ══════════════════════════════════════════════════════════════════════════
    const footerY = y;

    // Left: Prepared By
    doc.save();
    doc.font('Helvetica').fontSize(8).fillColor('#000000');
    doc.text('Prepared By:', PAGE_MARGIN, footerY);
    const prepLineY = footerY + 40;
    doc.lineWidth(0.5).moveTo(PAGE_MARGIN, prepLineY).lineTo(PAGE_MARGIN + 120, prepLineY).stroke('#000000');
    doc.restore();

    // Center: Stamp
    const stampX = PAGE_MARGIN + CONTENT_WIDTH / 2 - 50;
    if (settings.stampBase64) {
      try {
        const stampBuffer = Buffer.from(settings.stampBase64, 'base64');
        doc.image(stampBuffer, stampX, footerY, { width: 100, height: 60 });
      } catch (err) {
        logger.warn('Non-critical operation failed', { error: err.message });
      }
    }

    // Right: Received By
    const recX = PAGE_MARGIN + CONTENT_WIDTH - 140;
    doc.save();
    doc.font('Helvetica').fontSize(8).fillColor('#000000');
    doc.text('Received By:', recX, footerY);
    const recLineY = footerY + 40;
    doc.lineWidth(0.5).moveTo(recX, recLineY).lineTo(recX + 120, recLineY).stroke('#000000');
    doc.restore();

    doc.end();
  });
};

module.exports = { generateInvoicePDF, generatePayslipPDF, generateCreditNotePDF };
