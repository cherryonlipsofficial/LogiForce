import { useMemo } from 'react';

const selectStyle = {
  height: 32,
  fontSize: 12,
  padding: '4px 8px',
  borderRadius: 8,
  border: '1px solid var(--border2)',
  background: 'var(--surface2)',
  color: 'var(--text)',
  outline: 'none',
  minWidth: 100,
};

// Generate month options
const MONTHS = [
  { label: 'Jan', value: 1 }, { label: 'Feb', value: 2 }, { label: 'Mar', value: 3 },
  { label: 'Apr', value: 4 }, { label: 'May', value: 5 }, { label: 'Jun', value: 6 },
  { label: 'Jul', value: 7 }, { label: 'Aug', value: 8 }, { label: 'Sep', value: 9 },
  { label: 'Oct', value: 10 }, { label: 'Nov', value: 11 }, { label: 'Dec', value: 12 },
];

const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 5 }, (_, i) => currentYear - i);

const ReportFilters = ({ filters = [], params = {}, onChange, clients = [], projects = [] }) => {
  if (!filters.length) return null;

  const set = (key, value) => onChange({ ...params, [key]: value });

  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      {filters.includes('year') && (
        <select style={selectStyle} value={params.year || currentYear} onChange={e => set('year', Number(e.target.value))}>
          {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      )}

      {filters.includes('month') && (
        <select style={selectStyle} value={params.month || new Date().getMonth() + 1} onChange={e => set('month', Number(e.target.value))}>
          {MONTHS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
      )}

      {filters.includes('clientId') && (
        <select style={{ ...selectStyle, minWidth: 140 }} value={params.clientId || ''} onChange={e => set('clientId', e.target.value)}>
          <option value="">All clients</option>
          {clients.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
        </select>
      )}

      {filters.includes('projectId') && (
        <select style={{ ...selectStyle, minWidth: 140 }} value={params.projectId || ''} onChange={e => set('projectId', e.target.value)}>
          <option value="">All projects</option>
          {projects.map(p => <option key={p._id} value={p._id}>{p.name}</option>)}
        </select>
      )}

      {filters.includes('days') && (
        <select style={selectStyle} value={params.days || 90} onChange={e => set('days', Number(e.target.value))}>
          <option value={30}>30 days</option>
          <option value={60}>60 days</option>
          <option value={90}>90 days</option>
          <option value={180}>180 days</option>
        </select>
      )}
    </div>
  );
};

export default ReportFilters;
