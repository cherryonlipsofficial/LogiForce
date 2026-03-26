import { useState } from 'react';
import FleetSummaryBar from '../../components/vehicles/FleetSummaryBar';
import FleetFilters from '../../components/vehicles/FleetFilters';

const tabPill = (active) => ({
  padding: '7px 18px',
  fontSize: 13,
  fontWeight: 500,
  borderRadius: 20,
  border: 'none',
  cursor: 'pointer',
  fontFamily: 'var(--sans)',
  transition: 'all 0.15s ease',
  background: active ? 'var(--accent)' : 'var(--surface3)',
  color: active ? '#fff' : 'var(--text2)',
});

const VehiclesPage = () => {
  const [view, setView] = useState('fleet');
  const [filters, setFilters] = useState({
    type: '',
    supplierId: '',
    status: '',
    search: '',
  });

  return (
    <div style={{ padding: '24px', color: 'var(--text)' }}>
      {/* Page header + tabs */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 20,
        }}
      >
        <h1
          style={{
            fontFamily: 'var(--sans)',
            fontSize: 20,
            fontWeight: 500,
            margin: 0,
          }}
        >
          Vehicle fleet
        </h1>

        <div style={{ display: 'flex', gap: 6 }}>
          <button
            type="button"
            style={tabPill(view === 'fleet')}
            onClick={() => setView('fleet')}
          >
            Fleet
          </button>
          <button
            type="button"
            style={tabPill(view === 'catalog')}
            onClick={() => setView('catalog')}
          >
            Supplier catalog
          </button>
        </div>
      </div>

      {/* View content */}
      {view === 'fleet' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <FleetSummaryBar />
          <FleetFilters
            filters={filters}
            onChange={setFilters}
            vehicleCount={0}
          />
          {/* Vehicle card grid will go here */}
        </div>
      ) : (
        <div style={{ color: 'var(--text3)', fontSize: 13 }}>
          Supplier catalog — coming soon
        </div>
      )}
    </div>
  );
};

export default VehiclesPage;
