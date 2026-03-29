const STANDARD_DAYS = 26;

/**
 * Compute the effective daily rate based on rate basis.
 * @param {number} rate - ratePerDriver (monthly or daily depending on basis)
 * @param {string} rateBasis - 'monthly_fixed' | 'daily_rate' | 'per_trip'
 * @returns {number} The daily rate to use for billing
 */
function computeDailyRate(rate, rateBasis) {
  if (rateBasis === 'daily_rate') {
    return parseFloat(rate.toFixed(4));
  }
  // monthly_fixed and per_trip (default) — divide by standard days
  return parseFloat((rate / STANDARD_DAYS).toFixed(4));
}

/**
 * Compute line item amount.
 * @param {number} rate - ratePerDriver
 * @param {string} rateBasis - rate basis
 * @param {number} workingDays - attendance days
 * @returns {{ dailyRate: number, amount: number }}
 */
function computeLineAmount(rate, rateBasis, workingDays) {
  const dailyRate = computeDailyRate(rate, rateBasis);
  const amount = parseFloat((dailyRate * workingDays).toFixed(2));
  return { dailyRate, amount };
}

module.exports = { computeDailyRate, computeLineAmount, STANDARD_DAYS };
