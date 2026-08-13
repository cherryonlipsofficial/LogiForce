/**
 * Get the number of calendar days in a given month.
 * @param {number} year
 * @param {number} month - 1-based (1 = Jan, 12 = Dec)
 * @returns {number}
 */
function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

/**
 * Compute line item amount based on pay structure (rateBasis).
 *
 * - monthly_fixed: Pro-rata based on calendar days. Full rate if the driver
 *   worked every calendar day in the month; otherwise rate / calendarDays * workingDays.
 * - daily_rate:    rate × workingDays.
 * - per_order:     rate × totalOrders.
 *
 * @param {number} rate        - ratePerDriver
 * @param {string} rateBasis   - 'monthly_fixed' | 'daily_rate' | 'per_order'
 * @param {number} workingDays - attendance days
 * @param {object} [opts]
 * @param {number} [opts.year]        - period year  (required for monthly_fixed)
 * @param {number} [opts.month]       - period month (required for monthly_fixed, 1-based)
 * @param {number} [opts.totalOrders] - order count  (required for per_order)
 * @returns {{ dailyRate: number, amount: number }}
 */
function computeLineAmount(rate, rateBasis, workingDays, opts = {}) {
  if (rateBasis === 'daily_rate') {
    const dailyRate = parseFloat(rate.toFixed(4));
    const amount = parseFloat((dailyRate * workingDays).toFixed(2));
    return { dailyRate, amount };
  }

  if (rateBasis === 'per_order') {
    const totalOrders = opts.totalOrders || 0;
    const amount = parseFloat((rate * totalOrders).toFixed(2));
    // dailyRate not meaningful for per_order, but return rate for display
    return { dailyRate: rate, amount };
  }

  // monthly_fixed (default): pro-rata based on calendar days in the month
  const year = opts.year || new Date().getFullYear();
  const month = opts.month || new Date().getMonth() + 1;
  const calendarDays = daysInMonth(year, month);

  if (workingDays >= calendarDays) {
    // Full month — charge the full monthly rate
    return { dailyRate: parseFloat((rate / calendarDays).toFixed(4)), amount: parseFloat(rate.toFixed(2)) };
  }

  const dailyRate = parseFloat((rate / calendarDays).toFixed(4));
  const amount = parseFloat((dailyRate * workingDays).toFixed(2));
  return { dailyRate, amount };
}

/**
 * Compute OT line item amount based on the project's OT rate and basis.
 *
 * - per_hour: amount = otRate × overtimeHours
 * - per_day:  amount = otRate × overtimeHours (overtimeHours is interpreted
 *             as overtime days when the basis is per_day — operations
 *             enters daily counts instead of hourly counts).
 *
 * @param {number} otRate         - the project's OT rate
 * @param {string} otRateBasis    - 'per_hour' | 'per_day'
 * @param {number} overtimeHours  - overtime quantity captured on attendance
 * @returns {{ amount: number, units: number }}
 */
function computeOTLineAmount(otRate, otRateBasis, overtimeHours) {
  const rate = Number(otRate) || 0;
  const units = Number(overtimeHours) || 0;
  if (rate <= 0 || units <= 0) {
    return { amount: 0, units };
  }
  const amount = parseFloat((rate * units).toFixed(2));
  return { amount, units };
}

module.exports = { computeLineAmount, computeOTLineAmount, daysInMonth };
