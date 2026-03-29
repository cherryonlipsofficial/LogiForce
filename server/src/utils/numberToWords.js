/**
 * Convert a number to English words for UAE invoice "Amount in Words" line.
 * Handles numbers up to ~10 million AED.
 * Format: "AED : Eleven Thousand Three Hundred Forty Only"
 * With fils:  "AED : Five Thousand Two Hundred Fifty and 50/100 Only"
 */

const ones = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen',
];

const tens = [
  '', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety',
];

function convertHundreds(num) {
  let result = '';
  if (num >= 100) {
    result += ones[Math.floor(num / 100)] + ' Hundred';
    num %= 100;
    if (num > 0) result += ' ';
  }
  if (num >= 20) {
    result += tens[Math.floor(num / 10)];
    num %= 10;
    if (num > 0) result += ' ';
  }
  if (num > 0) {
    result += ones[num];
  }
  return result;
}

function numberToWordsRaw(num) {
  if (num === 0) return 'Zero';

  const units = ['', 'Thousand', 'Million'];
  let result = '';
  let unitIndex = 0;

  while (num > 0) {
    const chunk = num % 1000;
    if (chunk > 0) {
      const chunkWords = convertHundreds(chunk);
      const unit = units[unitIndex];
      if (result) {
        result = chunkWords + (unit ? ' ' + unit : '') + ' ' + result;
      } else {
        result = chunkWords + (unit ? ' ' + unit : '');
      }
    }
    num = Math.floor(num / 1000);
    unitIndex++;
  }

  return result.trim();
}

/**
 * Convert amount to words in UAE invoice format.
 * @param {number} amount - The monetary amount
 * @returns {string} e.g. "AED : Eleven Thousand Three Hundred Forty Only"
 */
function amountToWords(amount) {
  const wholePart = Math.floor(Math.abs(amount));
  const decimalPart = Math.round((Math.abs(amount) - wholePart) * 100);

  let words = numberToWordsRaw(wholePart);

  if (decimalPart > 0) {
    words += ` and ${decimalPart}/100`;
  }

  return `AED : ${words} Only`;
}

module.exports = { amountToWords, numberToWordsRaw };
