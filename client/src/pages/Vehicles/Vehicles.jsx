import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getVehicles } from '../../api/vehiclesApi';
import FleetSummaryBar from '../../components/vehicles/FleetSummaryBar';
import FleetFilters from '../../components/vehicles/FleetFilters';
import SupplierCatalogView from '../../components/vehicles/SupplierCatalogView';
import VehicleCard from '../../components/vehicles/VehicleCard';
import AssignVehicleModal from '../../components/vehicles/AssignVehicleModal';
import ReturnVehicleModal from '../../components/vehicles/ReturnVehicleModal';
import VehicleDetailPanel from '../../components/vehicles/VehicleDetailPanel';

const skeletonPulse = {
  animation: 'vehiclePulse 1.5s ease-in-out infinite',
};

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
  const queryClient = useQueryClient();
  const [view, setView] = useState('fleet');
  const [assignVehicle, setAssignVehicle] = useState(null);
  const [returnVehicle, setReturnVehicle] = useState(null);
  const [detailVehicle, setDetailVehicle] = useState(null);
  const [filters, setFilters] = useState({
    type: '',
    supplierId: '',
    status: '',
    search: '',
  });

  const { data, isLoading, isError } = useQuery({
    queryKey: ['vehicles', filters],
    queryFn: () => getVehicles(filters).then((r) => r.data),
    keepPreviousData: true,
  });

  const vehicles = data?.vehicles || [];
  const total = data?.total || 0;

  return (
    <div style={{ padding: '24px', color: 'var(--text)' }}>
      <style>{`
        @keyframes vehiclePulse {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 1; }
        }
      `}</style>

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
            vehicleCount={total}
          />

          {/* Vehicle card grid */}
          {isLoading ? (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: 14,
                marginTop: 16,
              }}
            >
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 14,
                    height: 200,
                    ...skeletonPulse,
                  }}
                />
              ))}
            </div>
          ) : isError ? (
            <div
              style={{
                textAlign: 'center',
                padding: '60px 20px',
                color: 'var(--text3)',
                fontSize: 14,
              }}
            >
              Failed to load vehicles. Try refreshing.
            </div>
          ) : vehicles.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '60px 20px',
                color: 'var(--text3)',
              }}
            >
              <div style={{ fontSize: 48, marginBottom: 12, opacity: 0.4 }}>◫</div>
              <div style={{ fontSize: 14 }}>No vehicles match your filters</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>
                Try adjusting the filters above
              </div>
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: 14,
                marginTop: 16,
              }}
            >
              {vehicles.map((v) => (
                <VehicleCard
                  key={v._id}
                  vehicle={v}
                  onAssign={(v) => setAssignVehicle(v)}
                  onReturn={(v) => setReturnVehicle(v)}
                  onViewDetail={(v) => setDetailVehicle(v)}
                />
              ))}
            </div>
          )}
        </div>
      ) : (
        <SupplierCatalogView />
      )}

      {assignVehicle && (
        <AssignVehicleModal
          vehicle={assignVehicle}
          onClose={() => setAssignVehicle(null)}
          onSuccess={() => queryClient.invalidateQueries({ queryKey: ['vehicles'] })}
        />
      )}

      {returnVehicle && (
        <ReturnVehicleModal
          vehicle={returnVehicle}
          onClose={() => setReturnVehicle(null)}
          onSuccess={() => queryClient.invalidateQueries({ queryKey: ['vehicles'] })}
        />
      )}

      {detailVehicle && (
        <VehicleDetailPanel
          vehicleId={detailVehicle._id}
          onClose={() => setDetailVehicle(null)}
        />
      )}
    </div>
  );
};

export default VehiclesPage;
