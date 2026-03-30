import { useMemo } from 'react';
import { useUserPrefs } from './useUserPrefs.jsx';
import { toArabicNumerals } from '../utils/arabicNumerals';
import {
  formatNumber as _formatNumber,
  formatCurrency as _formatCurrency,
  formatCurrencyFull as _formatCurrencyFull,
  formatPercent as _formatPercent,
} from '../utils/formatters';

/**
 * Returns formatter functions pre-bound to the user's Arabic numerals preference.
 *
 * Usage:
 *   const { n, formatCurrency, formatCurrencyFull, formatPercent, formatNumber } = useFormatters();
 *   <span>{formatCurrencyFull(amount)}</span>
 *   <span>AED {n((salary).toLocaleString())}</span>
 */
export function useFormatters() {
  const { arabicNumerals } = useUserPrefs();

  return useMemo(() => ({
    /** Shorthand: convert an already-formatted string's digits */
    n: (str) => (arabicNumerals ? toArabicNumerals(str) : String(str)),
    formatNumber: (v) => _formatNumber(v, arabicNumerals),
    formatCurrency: (v) => _formatCurrency(v, arabicNumerals),
    formatCurrencyFull: (v) => _formatCurrencyFull(v, arabicNumerals),
    formatPercent: (v) => _formatPercent(v, arabicNumerals),
  }), [arabicNumerals]);
}
