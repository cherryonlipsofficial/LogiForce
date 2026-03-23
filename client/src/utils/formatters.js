export const formatCurrency = (amount) => {
  if (amount == null) return '—';
  const num = Number(amount);
  if (num >= 1000000) return `AED ${(num / 1000000).toFixed(2)}M`;
  if (num >= 1000) return `AED ${(num / 1000).toFixed(0)}K`;
  return `AED ${num.toLocaleString()}`;
};

export const formatCurrencyFull = (amount) => {
  if (amount == null) return '—';
  return `AED ${Number(amount).toLocaleString()}`;
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

export const formatPercent = (value) => {
  if (value == null) return '—';
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
};
