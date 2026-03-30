import { toArabicNumerals } from './arabicNumerals';

const _an = (str, arabic) => (arabic ? toArabicNumerals(str) : str);

export const formatNumber = (value, arabic) => {
  if (value == null) return '—';
  return _an(Number(value).toLocaleString(), arabic);
};

export const formatCurrency = (amount, arabic) => {
  if (amount == null) return '—';
  const num = Number(amount);
  let result;
  if (num >= 1000000) result = `AED ${(num / 1000000).toFixed(2)}M`;
  else if (num >= 1000) result = `AED ${(num / 1000).toFixed(0)}K`;
  else result = `AED ${num.toLocaleString()}`;
  return _an(result, arabic);
};

export const formatCurrencyFull = (amount, arabic) => {
  if (amount == null) return '—';
  return _an(`AED ${Number(amount).toLocaleString()}`, arabic);
};

export const formatDate = (date) => {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  });
};

export const formatPhone = (phone) =>
  phone?.replace(/(\d{3})(\d{2})(\d{3})(\d{4})/, '$1 $2 $3 $4') || '';

export const formatPercent = (value, arabic) => {
  if (value == null) return '—';
  const sign = value >= 0 ? '+' : '';
  return _an(`${sign}${value.toFixed(1)}%`, arabic);
};

export function formatRelativeTime(dateString) {
  if (!dateString) return 'Never';
  const diff = Date.now() - new Date(dateString).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins  <  1) return 'Just now';
  if (mins  < 60) return `${mins} min ago`;
  if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  if (days  <  7) return `${days} day${days > 1 ? 's' : ''} ago`;
  return new Date(dateString).toLocaleDateString('en-AE', {
    day: '2-digit', month: 'short', year: 'numeric'
  });
}

export function formatShortDate(dateString) {
  if (!dateString) return '—';
  return new Date(dateString).toLocaleDateString('en-AE', {
    day: '2-digit', month: 'short', year: 'numeric'
  });
}
