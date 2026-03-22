export const formatCurrency = (amount) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amount);

export const formatDate = (date) =>
  new Date(date).toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

export const formatPhone = (phone) =>
  phone?.replace(/(\d{5})(\d{5})/, '$1 $2') || '';
