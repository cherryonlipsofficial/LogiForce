// Shared form styles for the platform console.
export const inputStyle = {
  width: '100%', height: 36, padding: '0 12px', borderRadius: 8,
  border: '1px solid var(--border2)', background: 'var(--surface2)',
  color: 'var(--text)', fontSize: 13, outline: 'none', boxSizing: 'border-box',
};

export const labelStyle = {
  display: 'block', fontSize: 11, fontWeight: 500, color: 'var(--text3)',
  textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6,
};

export const sectionTitle = {
  fontSize: 12, fontWeight: 600, textTransform: 'uppercase',
  letterSpacing: '0.06em', color: 'var(--text2)', marginBottom: 12,
};

export const tableStyle = { width: '100%', borderCollapse: 'collapse', fontSize: 13 };
export const thStyle = {
  textAlign: 'left', padding: '10px 12px', fontSize: 11, fontWeight: 500,
  color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em',
  borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap',
};
export const tdStyle = { padding: '10px 12px', borderBottom: '1px solid var(--border)', verticalAlign: 'top' };

export const errorBox = {
  padding: '10px 14px', borderRadius: 8, fontSize: 12, lineHeight: 1.5,
  background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171',
};
export const noteBox = {
  padding: '10px 14px', borderRadius: 8, fontSize: 12, lineHeight: 1.5,
  background: 'rgba(124,95,240,0.08)', border: '1px solid rgba(124,95,240,0.2)', color: 'var(--text2)',
};
export const okBox = {
  padding: '10px 14px', borderRadius: 8, fontSize: 12, lineHeight: 1.5,
  background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)', color: 'var(--text2)',
};

export const formatDate = (value) => (value ? new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—');
export const formatDateTime = (value) => (value ? new Date(value).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
