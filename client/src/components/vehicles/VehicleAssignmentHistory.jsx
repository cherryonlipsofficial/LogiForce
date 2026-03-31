import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Badge from '../ui/Badge';
import Avatar from '../ui/Avatar';
import { getVehicleAssignmentHistory } from '../../api/vehiclesApi';
import { useFormatters } from '../../hooks/useFormatters';

const getInitials = (name) =>
  (name || '')
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

const fmt = (d) =>
  d
    ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—';

const conditionLabel = {
  good: 'Good',
  minor_damage: 'Minor damage',
  major_damage: 'Major damage',
  total_loss: 'Total loss',
};

const conditionVariant = {
  good: 'success',
  minor_damage: 'warning',
  major_damage: 'danger',
  total_loss: 'danger',
};

const VehicleAssignmentHistory = ({ vehicleId }) => {
  const { n } = useFormatters();
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['vehicle-assignment-history', vehicleId, page],
    queryFn: () => getVehicleAssignmentHistory(vehicleId, page).then((r) => r.data),
    enabled: !!vehicleId,
    keepPreviousData: true,
  });

  const assignments = data?.assignments || [];
  const total = data?.total || 0;
  const limit = data?.limit || 20;
  const totalPages = Math.ceil(total / limit);

  if (isLoading && assignments.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
        {[1, 2].map((i) => (
          <div
            key={i}
            style={{
              height: 64,
              borderRadius: 10,
              background: 'var(--surface2)',
              animation: 'pulse 1.5s ease-in-out infinite',
            }}
          />
        ))}
        <style>{`@keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: .4 } }`}</style>
      </div>
    );
  }

  if (!isLoading && assignments.length === 0) {
    return (
      <div style={{ fontSize: 12, color: 'var(--text3)', padding: '10px 0' }}>
        No assignment history for this vehicle.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
      {assignments.map((h) => {
        const isActive = h.status === 'active';
        const duration = h.assignedDate
          ? Math.ceil(
              ((h.returnedDate ? new Date(h.returnedDate) : new Date()) - new Date(h.assignedDate)) / 86400000
            )
          : null;
        const hasDamage = h.returnCondition && h.returnCondition !== 'good';

        return (
          <div
            key={h._id}
            style={{
              border: `0.5px solid var(--border)`,
              borderLeft: isActive ? '3px solid #4ade80' : '0.5px solid var(--border)',
              borderRadius: 10,
              padding: '12px 14px',
              position: 'relative',
            }}
          >
            {/* Top row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: isActive ? '#4ade80' : 'var(--text3)',
                    flexShrink: 0,
                  }}
                />
                <Avatar initials={getInitials(h.driverName || h.driverId?.fullName)} size={28} />
                <div>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{h.driverName || h.driverId?.fullName || '—'}</span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', marginLeft: 6 }}>
                    {h.driverEmployeeCode || h.driverId?.employeeCode || ''}
                  </span>
                </div>
              </div>
              <div>
                {isActive ? (
                  <Badge variant="success">Active</Badge>
                ) : (
                  <Badge variant="default">Returned</Badge>
                )}
              </div>
            </div>

            {/* Middle row */}
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <span>Assigned: {fmt(h.assignedDate)} by {h.assignedByName || h.assignedBy?.name || '—'}</span>
              {h.returnedDate && (
                <span>
                  → Returned: {fmt(h.returnedDate)} by {h.returnedByName || h.returnedBy?.name || '—'}
                </span>
              )}
              {duration != null && <span>Duration: {duration} days</span>}
            </div>

            {isActive && (
              <span
                style={{
                  position: 'absolute',
                  top: 12,
                  right: 14,
                  display: 'none',
                }}
              />
            )}

            {/* Damage strip */}
            {h.status === 'returned' && hasDamage && (
              <div
                style={{
                  marginTop: 8,
                  background: h.returnCondition === 'minor_damage' ? 'rgba(251,191,36,0.08)' : 'rgba(248,113,113,0.08)',
                  border: `1px solid ${h.returnCondition === 'minor_damage' ? 'rgba(251,191,36,0.2)' : 'rgba(248,113,113,0.2)'}`,
                  borderRadius: 6,
                  padding: '6px 10px',
                  fontSize: 11,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  flexWrap: 'wrap',
                }}
              >
                <Badge variant={conditionVariant[h.returnCondition]}>
                  {conditionLabel[h.returnCondition] || h.returnCondition}
                </Badge>
                {h.damageNotes && (
                  <span style={{ color: 'var(--text3)' }}>
                    {h.damageNotes.length > 80 ? h.damageNotes.slice(0, 80) + '...' : h.damageNotes}
                  </span>
                )}
                {h.damagePenaltyAmount > 0 && (
                  <span style={{ color: '#f87171', fontFamily: 'var(--mono)', fontWeight: 500 }}>
                    Penalty: AED {n(Number(h.damagePenaltyAmount).toLocaleString())}
                  </span>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Pagination */}
      {total > limit && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            paddingTop: 8,
          }}
        >
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            style={{
              fontSize: 12,
              padding: '6px 16px',
              borderRadius: 6,
              border: '1px solid var(--border)',
              background: 'var(--surface2)',
              color: page >= totalPages ? 'var(--text3)' : 'var(--accent)',
              cursor: page >= totalPages ? 'default' : 'pointer',
              opacity: page >= totalPages ? 0.5 : 1,
            }}
          >
            Load more
          </button>
        </div>
      )}
    </div>
  );
};

export default VehicleAssignmentHistory;
