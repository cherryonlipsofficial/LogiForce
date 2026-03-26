import { useQuery } from '@tanstack/react-query';
import { getFleetSummary } from '../../api/vehiclesApi';

const statTiles = [
  { key: 'total', label: 'Total fleet', color: 'var(--text)' },
  { key: 'available', label: 'Available', color: '#4ade80' },
  { key: 'assigned', label: 'Assigned', color: '#7eb3fc' },
  { key: 'maintenance', label: 'Maintenance', color: '#fbbf24' },
  { key: 'offHired', label: 'Off-hired', color: '#f87171' },
];

const barSegments = [
  { key: 'available', color: '#4ade80', label: 'Available' },
  { key: 'assigned', color: '#7eb3fc', label: 'Assigned' },
  { key: 'maintenance', color: '#fbbf24', label: 'Maintenance' },
  { key: 'offHired', color: '#f87171', label: 'Off-hired' },
];

function LoadingSkeleton() {
  const skeletonStyle = {
    background: 'var(--surface3)',
    borderRadius: 8,
    height: 56,
    flex: 1,
  };
  return (
    <div style={{ display: 'flex', gap: 12 }}>
      <div style={skeletonStyle} />
      <div style={skeletonStyle} />
      <div style={skeletonStyle} />
    </div>
  );
}

export default function FleetSummaryBar() {
  const { data: summary, isLoading } = useQuery({
    queryKey: ['fleet-summary'],
    queryFn: () => getFleetSummary().then(r => r.data),
    staleTime: 60_000,
  });

  if (isLoading || !summary) return <LoadingSkeleton />;

  const total = summary.total || 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* ROW 1 — stat tiles */}
      <div style={{ display: 'flex', gap: 0 }}>
        {statTiles.map((tile, i) => (
          <div key={tile.key} style={{ display: 'flex', flex: 1 }}>
            <div
              style={{
                flex: 1,
                background: 'var(--surface2)',
                borderRadius: 10,
                padding: '14px 20px',
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  textTransform: 'uppercase',
                  color: 'var(--text3)',
                  letterSpacing: '0.5px',
                  marginBottom: 4,
                  fontFamily: 'var(--sans)',
                }}
              >
                {tile.label}
              </div>
              <div
                style={{
                  fontSize: 24,
                  fontWeight: 600,
                  color: tile.color,
                  fontFamily: 'var(--sans)',
                }}
              >
                {summary[tile.key] ?? 0}
              </div>
            </div>
            {i < statTiles.length - 1 && (
              <div
                style={{
                  width: 1,
                  alignSelf: 'stretch',
                  background: 'var(--border)',
                  margin: '8px 0',
                }}
              />
            )}
          </div>
        ))}
      </div>

      {/* ROW 2 — proportion bar */}
      <div
        style={{
          width: '100%',
          height: 6,
          borderRadius: 3,
          background: 'var(--surface3)',
          display: 'flex',
          overflow: 'hidden',
        }}
      >
        {total > 0 ? (
          barSegments.map((seg) => {
            const count = summary[seg.key] || 0;
            if (count === 0) return null;
            return (
              <div
                key={seg.key}
                title={`${seg.label}: ${count}`}
                style={{
                  width: `${(count / total) * 100}%`,
                  height: '100%',
                  background: seg.color,
                  display: 'inline-block',
                }}
              />
            );
          })
        ) : null}
      </div>

      {/* Contract expiry warnings */}
      {summary.contractsExpiringIn7Days > 0 ? (
        <div
          style={{
            textAlign: 'right',
            fontSize: 11,
            color: '#f87171',
            fontFamily: 'var(--sans)',
          }}
        >
          ⚠ {summary.contractsExpiringIn7Days} contract(s) expiring within 7 days
        </div>
      ) : summary.contractsExpiringIn30Days > 0 ? (
        <div
          style={{
            textAlign: 'right',
            fontSize: 11,
            color: '#fbbf24',
            fontFamily: 'var(--sans)',
          }}
        >
          {summary.contractsExpiringIn30Days} contract(s) expiring within 30 days
        </div>
      ) : null}
    </div>
  );
}
