import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getSuppliers } from '../../api/suppliersApi';

const typeOptions = ['All', 'Car', 'Van/Truck', 'Bike'];

const statusOptions = [
  { value: '', label: 'All statuses' },
  { value: 'Available', label: 'Available' },
  { value: 'Assigned', label: 'Assigned' },
  { value: 'Maintenance', label: 'Maintenance' },
  { value: 'Off-hired', label: 'Off-hired' },
];

const pillBase = {
  padding: '6px 14px',
  fontSize: 13,
  borderRadius: 8,
  border: '1px solid',
  cursor: 'pointer',
  fontFamily: 'var(--sans)',
  transition: 'all 0.15s ease',
};

const activePill = {
  ...pillBase,
  background: 'rgba(79,142,247,0.15)',
  borderColor: 'rgba(79,142,247,0.4)',
  color: 'var(--accent)',
};

const inactivePill = {
  ...pillBase,
  background: 'var(--surface3)',
  borderColor: 'var(--border2)',
  color: 'var(--text2)',
};

const selectStyle = {
  background: 'var(--surface2)',
  border: '1px solid var(--border2)',
  borderRadius: 8,
  padding: '7px 12px',
  fontSize: 13,
  color: 'var(--text)',
  fontFamily: 'var(--sans)',
  outline: 'none',
  appearance: 'none',
  cursor: 'pointer',
};

export default function FleetFilters({ filters, onChange, vehicleCount = 0 }) {
  const [localSearch, setLocalSearch] = useState(filters.search || '');
  const timerRef = useRef(null);

  const { data: suppliersData } = useQuery({
    queryKey: ['suppliers-list'],
    queryFn: () => getSuppliers().then(r => r.data),
    staleTime: 120_000,
  });

  const suppliers = Array.isArray(suppliersData) ? suppliersData : [];

  useEffect(() => {
    setLocalSearch(filters.search || '');
  }, [filters.search]);

  const handleSearchChange = (e) => {
    const val = e.target.value;
    setLocalSearch(val);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      onChange({ ...filters, search: val });
    }, 300);
  };

  useEffect(() => {
    return () => clearTimeout(timerRef.current);
  }, []);

  const setFilter = (key, value) => {
    onChange({ ...filters, [key]: value });
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        flexWrap: 'wrap',
      }}
    >
      {/* Type filter pills */}
      <div style={{ display: 'flex', gap: 4 }}>
        {typeOptions.map((t) => {
          const value = t === 'All' ? '' : t;
          const isActive = filters.type === value;
          return (
            <button
              key={t}
              type="button"
              style={isActive ? activePill : inactivePill}
              onClick={() => setFilter('type', value)}
            >
              {t}
            </button>
          );
        })}
      </div>

      {/* Supplier select */}
      <select
        value={filters.supplierId || ''}
        onChange={(e) => setFilter('supplierId', e.target.value)}
        style={{ ...selectStyle, width: 180 }}
      >
        <option value="">All suppliers</option>
        {suppliers.map((s) => (
          <option key={s._id} value={s._id}>
            {s.name}
          </option>
        ))}
      </select>

      {/* Status select */}
      <select
        value={filters.status || ''}
        onChange={(e) => setFilter('status', e.target.value)}
        style={{ ...selectStyle, width: 160 }}
      >
        {statusOptions.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      {/* Search box */}
      <input
        type="text"
        placeholder="Search plate or driver..."
        value={localSearch}
        onChange={handleSearchChange}
        style={{
          ...selectStyle,
          flex: 1,
          minWidth: 160,
        }}
      />

      {/* Vehicle count */}
      <span
        style={{
          fontSize: 12,
          color: 'var(--text3)',
          fontFamily: 'var(--sans)',
          whiteSpace: 'nowrap',
        }}
      >
        {vehicleCount} vehicles
      </span>
    </div>
  );
}
