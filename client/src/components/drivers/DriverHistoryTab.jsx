import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getDriverHistory } from '../../api/driversApi';
import { getDriverVehicleHistory } from '../../api/vehiclesApi';
import StatusBadge from '../ui/StatusBadge';
import Avatar from '../ui/Avatar';
import Badge from '../ui/Badge';

const DOT_COLORS = {
  status_change: '#fbbf24',
  document_uploaded: '#7eb3fc',
  document_verified: '#4ade80',
  document_expired: '#f87171',
  contacts_verified: '#4ade9a',
  client_user_id_set: '#a78bfa',
  field_updated: '#60a5fa',
  note_added: 'var(--text3)',
  vehicle_assignment: '#a78bfa',
  driver_created: '#4ade80',
  driver_deleted: '#f87171',
  driver_activated: '#4ade80',
};

const DOT_ICONS = {
  status_change: '\u2195',
  document_uploaded: '\u2191',
  document_verified: '\u2713',
  contacts_verified: '\u2713',
  client_user_id_set: '#',
  field_updated: '\u270E',
  note_added: '\u270E',
  vehicle_assignment: '\u2B21',
  driver_created: '+',
  driver_deleted: '\u2717',
  driver_activated: '\u2713',
};

const formatTimestamp = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d)) return '';
  const now = new Date();
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return `Today at ${time}`;

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return `Yesterday at ${time}`;

  return `${d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} at ${time}`;
};

const fmt = (d) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const getInitials = (name) => {
  if (!name) return '?';
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
};

const SkeletonRow = () => (
  <div
    style={{
      height: 56,
      borderRadius: 6,
      background: 'var(--surface2)',
      animation: 'pulse 1.5s ease-in-out infinite',
    }}
  />
);

const DriverHistoryTab = ({ driverId }) => {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({
    queryKey: ['driver-history', driverId, page],
    queryFn: () => getDriverHistory(driverId, page).then((r) => r.data),
    keepPreviousData: true,
  });

  const { data: vhData } = useQuery({
    queryKey: ['driver-vehicle-history', driverId],
    queryFn: () => getDriverVehicleHistory(driverId, 1, 50).then((r) => r.data),
    enabled: !!driverId,
  });

  const entries = data?.entries || [];
  const total = data?.total || 0;
  const limit = data?.limit || 30;
  const totalPages = Math.ceil(total / limit);

  // Convert vehicle assignments to timeline entries and merge
  const vehicleEntries = (vhData?.assignments || []).flatMap((a) => {
    const items = [];
    items.push({
      _id: `va-assign-${a._id}`,
      _type: 'vehicle_assignment',
      eventType: 'vehicle_assignment',
      description: `Vehicle assigned: ${a.vehiclePlateNumber || 'Unknown'} — ${a.vehicleMakeModel || ''}`,
      createdAt: a.assignedDate,
      performedByName: a.assignedByName || a.assignedBy?.name,
      _vehicleAssignment: a,
      _subType: 'assigned',
    });
    if (a.status === 'returned' && a.returnedDate) {
      items.push({
        _id: `va-return-${a._id}`,
        _type: 'vehicle_assignment',
        eventType: 'vehicle_assignment',
        description: `Vehicle returned: ${a.vehiclePlateNumber || 'Unknown'} — Condition: ${a.returnCondition || 'good'}`,
        createdAt: a.returnedDate,
        performedByName: a.returnedByName || a.returnedBy?.name,
        _vehicleAssignment: a,
        _subType: 'returned',
      });
    }
    return items;
  });

  // Merge and sort by date (newest first)
  const allEntries = [...entries, ...vehicleEntries].sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  );

  if (isLoading && entries.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
        <style>{`@keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: .4 } }`}</style>
      </div>
    );
  }

  if (!isLoading && allEntries.length === 0) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '60px 20px',
          color: 'var(--text3)',
          gap: 12,
        }}
      >
        <span style={{ fontSize: 28, opacity: 0.4 }}>📋</span>
        <span style={{ fontSize: 13 }}>No history yet for this driver.</span>
      </div>
    );
  }

  const start = (page - 1) * limit + 1;
  const end = Math.min(page * limit, total);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {allEntries.map((entry, i) => {
          const isStatusChange = entry.eventType === 'status_change';
          const isVehicle = entry._type === 'vehicle_assignment';
          const isCreated = entry.eventType === 'driver_created';
          const isDeleted = entry.eventType === 'driver_deleted';
          const isHighlight = isStatusChange || isCreated || isDeleted;
          const dotColor = isVehicle ? '#a78bfa' : (DOT_COLORS[entry.eventType] || 'var(--text3)');
          const icon = isVehicle ? '\u2B21' : (DOT_ICONS[entry.eventType] || '');
          const isLast = i === allEntries.length - 1;
          const isAdmin =
            entry.performedByRole &&
            (entry.performedByRole.toLowerCase().includes('admin') ||
              entry.performedByRole.toLowerCase().includes('administrator'));

          return (
            <div
              key={entry._id || i}
              style={{
                display: 'flex',
                gap: 0,
                ...(isStatusChange
                  ? {
                      background: 'rgba(245,158,11,0.04)',
                      borderLeft: '2px solid #fbbf24',
                      borderRadius: 4,
                      marginBottom: 2,
                    }
                  : isCreated
                  ? {
                      background: 'rgba(74,222,128,0.04)',
                      borderLeft: '2px solid #4ade80',
                      borderRadius: 4,
                      marginBottom: 2,
                    }
                  : isDeleted
                  ? {
                      background: 'rgba(248,113,113,0.04)',
                      borderLeft: '2px solid #f87171',
                      borderRadius: 4,
                      marginBottom: 2,
                    }
                  : isVehicle
                  ? {
                      background: 'rgba(167,139,250,0.04)',
                      borderLeft: '2px solid #a78bfa',
                      borderRadius: 4,
                      marginBottom: 2,
                    }
                  : {}),
              }}
            >
              {/* Timeline column */}
              {!isHighlight && !isVehicle && (
                <div
                  style={{
                    width: 40,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    flexShrink: 0,
                    paddingTop: 14,
                  }}
                >
                  <div
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: '50%',
                      background: dotColor,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 7,
                      color: '#fff',
                      fontWeight: 700,
                      flexShrink: 0,
                    }}
                  >
                    {icon}
                  </div>
                  {!isLast && (
                    <div
                      style={{
                        width: 1,
                        flex: 1,
                        background: 'var(--border)',
                        marginTop: 4,
                      }}
                    />
                  )}
                </div>
              )}

              {/* Content */}
              <div
                style={{
                  flex: 1,
                  padding: (isHighlight || isVehicle) ? '10px 12px' : '10px 10px 10px 0',
                  minHeight: 40,
                }}
              >
                {/* Row 1: description + timestamp */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: 8,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span
                      style={{
                        fontSize: 13,
                        color: 'var(--text)',
                        fontWeight: (isHighlight || isVehicle) ? 600 : 400,
                      }}
                    >
                      {entry.description}
                    </span>
                    {isStatusChange && isAdmin && (
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 600,
                          color: '#f87171',
                          background: 'rgba(248,113,113,0.1)',
                          border: '1px solid rgba(248,113,113,0.2)',
                          borderRadius: 9999,
                          padding: '1px 7px',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        Admin override
                      </span>
                    )}
                  </div>
                  <span
                    style={{
                      fontSize: 11,
                      color: 'var(--text3)',
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                    }}
                  >
                    {formatTimestamp(entry.createdAt)}
                  </span>
                </div>

                {/* Status badges */}
                {isStatusChange && entry.statusFrom && entry.statusTo && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      marginTop: 6,
                    }}
                  >
                    <StatusBadge status={entry.statusFrom} />
                    <span style={{ fontSize: 11, color: 'var(--text3)' }}>→</span>
                    <StatusBadge status={entry.statusTo} />
                  </div>
                )}

                {/* Vehicle assignment details */}
                {isVehicle && entry._vehicleAssignment && (
                  <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text3)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <span>{fmt(entry._vehicleAssignment.assignedDate)}</span>
                    {entry._subType === 'returned' && entry._vehicleAssignment.returnCondition && (
                      <Badge variant={entry._vehicleAssignment.returnCondition === 'good' ? 'success' : 'warning'}>
                        {entry._vehicleAssignment.returnCondition.replace('_', ' ')}
                      </Badge>
                    )}
                  </div>
                )}

                {/* Field change details (old → new) */}
                {entry.eventType === 'field_updated' && entry.oldValue && entry.newValue && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      marginTop: 6,
                      fontSize: 12,
                      padding: '4px 8px',
                      background: 'var(--surface2)',
                      borderRadius: 4,
                      border: '1px solid var(--border)',
                    }}
                  >
                    <span style={{ color: '#f87171', textDecoration: 'line-through' }}>
                      {entry.oldValue}
                    </span>
                    <span style={{ color: 'var(--text3)', fontSize: 11 }}>{'\u2192'}</span>
                    <span style={{ color: '#4ade80', fontWeight: 500 }}>
                      {entry.newValue}
                    </span>
                  </div>
                )}

                {/* Reason */}
                {entry.reason && (
                  <div
                    style={{
                      fontSize: 12,
                      color: 'var(--text3)',
                      fontStyle: 'italic',
                      marginTop: 4,
                    }}
                  >
                    Reason: {entry.reason}
                  </div>
                )}

                {/* Performer */}
                {entry.performedByName && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      marginTop: 6,
                    }}
                  >
                    <Avatar initials={getInitials(entry.performedByName)} size={20} />
                    <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text)' }}>
                      {entry.performedByName}
                    </span>
                    {entry.performedBy?.email && (
                      <span style={{ fontSize: 11, color: 'var(--text3)' }}>
                        ({entry.performedBy.email})
                      </span>
                    )}
                    {entry.performedByRole && (
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 500,
                          color: 'var(--accent)',
                          background: 'var(--surface2)',
                          border: '1px solid var(--border)',
                          borderRadius: 9999,
                          padding: '1px 7px',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {entry.performedByRole}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Pagination */}
      {total > limit && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 0',
            borderTop: '1px solid var(--border)',
            marginTop: 8,
            fontSize: 11,
            color: 'var(--text3)',
          }}
        >
          <span>
            Showing {start}–{end} of {total} events
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              style={{
                fontSize: 11,
                padding: '4px 10px',
                borderRadius: 4,
                border: '1px solid var(--border)',
                background: 'var(--surface2)',
                color: page === 1 ? 'var(--text3)' : 'var(--text)',
                cursor: page === 1 ? 'default' : 'pointer',
                opacity: page === 1 ? 0.5 : 1,
              }}
            >
              ← Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              style={{
                fontSize: 11,
                padding: '4px 10px',
                borderRadius: 4,
                border: '1px solid var(--border)',
                background: 'var(--surface2)',
                color: page >= totalPages ? 'var(--text3)' : 'var(--text)',
                cursor: page >= totalPages ? 'default' : 'pointer',
                opacity: page >= totalPages ? 0.5 : 1,
              }}
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default DriverHistoryTab;
