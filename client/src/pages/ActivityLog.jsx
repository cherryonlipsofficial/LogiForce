import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import Card from '../components/ui/Card';
import Avatar from '../components/ui/Avatar';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import { getActivityLog, getActivityLogUsers } from '../api/activityLogApi';

const EVENT_TYPE_OPTIONS = [
  { value: '', label: 'All events' },
  { value: 'status_change', label: 'Status change' },
  { value: 'document_uploaded', label: 'Document uploaded' },
  { value: 'document_verified', label: 'Document verified' },
  { value: 'document_expired', label: 'Document expired' },
  { value: 'field_updated', label: 'Field updated' },
  { value: 'driver_created', label: 'Driver created' },
  { value: 'driver_deleted', label: 'Driver deleted' },
  { value: 'driver_activated', label: 'Driver activated' },
  { value: 'contacts_verified', label: 'Contacts verified' },
  { value: 'client_user_id_set', label: 'Client User ID set' },
  { value: 'personal_verification_confirmed', label: 'Personal verification confirmed' },
  { value: 'note_added', label: 'Note added' },
];

const EVENT_COLORS = {
  status_change: '#fbbf24',
  document_uploaded: '#7eb3fc',
  document_verified: '#4ade80',
  document_expired: '#f87171',
  field_updated: '#60a5fa',
  driver_created: '#4ade80',
  driver_deleted: '#f87171',
  driver_activated: '#4ade80',
  contacts_verified: '#4ade9a',
  client_user_id_set: '#a78bfa',
  note_added: 'var(--text3)',
  personal_verification_confirmed: '#4ade9a',
};

const getInitials = (name) => {
  if (!name) return '?';
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
};

const formatDateTime = (d) => {
  if (!d) return '';
  const date = new Date(d);
  if (isNaN(date)) return '';
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const ActivityLog = () => {
  const navigate = useNavigate();
  const [userId, setUserId] = useState('');
  const [eventType, setEventType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const limit = 50;

  const { data: usersData } = useQuery({
    queryKey: ['activity-log-users'],
    queryFn: () => getActivityLogUsers(),
    staleTime: 5 * 60 * 1000,
  });
  const users = usersData?.data || [];

  const filters = { page, limit };
  if (userId) filters.userId = userId;
  if (eventType) filters.eventType = eventType;
  if (from) filters.from = from;
  if (to) filters.to = to;

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['activity-log', filters],
    queryFn: () => getActivityLog(filters),
    keepPreviousData: true,
    onError: () => toast.error('Failed to load activity log'),
  });

  const entries = data?.data?.entries || [];
  const total = data?.data?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  const resetFilters = () => {
    setUserId('');
    setEventType('');
    setFrom('');
    setTo('');
    setPage(1);
  };

  const inputStyle = {
    padding: '6px 10px',
    borderRadius: 6,
    border: '1px solid var(--border2)',
    background: 'var(--surface2)',
    color: 'var(--text)',
    fontSize: 12,
    minWidth: 140,
  };

  return (
    <div className="page-enter" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Activity log</h1>
        <p style={{ fontSize: 13, color: 'var(--text3)', margin: '4px 0 0' }}>
          System-wide log of user activity. Identify who did what across all drivers.
        </p>
      </div>

      {/* Filters */}
      <Card style={{ padding: 0 }}>
        <div style={{ padding: 14, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, color: 'var(--text3)' }}>User</label>
            <select
              value={userId}
              onChange={(e) => { setUserId(e.target.value); setPage(1); }}
              style={inputStyle}
            >
              <option value="">All users</option>
              {users.map((u) => (
                <option key={u._id} value={u._id}>{u.name} ({u.email})</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, color: 'var(--text3)' }}>Event type</label>
            <select
              value={eventType}
              onChange={(e) => { setEventType(e.target.value); setPage(1); }}
              style={inputStyle}
            >
              {EVENT_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, color: 'var(--text3)' }}>From</label>
            <input
              type="date"
              value={from}
              onChange={(e) => { setFrom(e.target.value); setPage(1); }}
              style={inputStyle}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, color: 'var(--text3)' }}>To</label>
            <input
              type="date"
              value={to}
              onChange={(e) => { setTo(e.target.value); setPage(1); }}
              style={inputStyle}
            />
          </div>

          <button
            onClick={resetFilters}
            style={{
              padding: '7px 14px',
              borderRadius: 6,
              border: '1px solid var(--border2)',
              background: 'transparent',
              color: 'var(--text2)',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            Reset
          </button>

          <div style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text3)' }}>
            {isFetching ? 'Loading…' : `${total.toLocaleString()} event${total === 1 ? '' : 's'}`}
          </div>
        </div>
      </Card>

      {/* Table */}
      <Card style={{ padding: 0 }}>
        {isLoading ? (
          <div style={{ padding: 24 }}><LoadingSpinner /></div>
        ) : entries.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
            No activity matches the selected filters.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface2)' }}>
                  <th style={{ textAlign: 'left', padding: '10px 12px', fontWeight: 500, color: 'var(--text3)', fontSize: 11 }}>When</th>
                  <th style={{ textAlign: 'left', padding: '10px 12px', fontWeight: 500, color: 'var(--text3)', fontSize: 11 }}>User</th>
                  <th style={{ textAlign: 'left', padding: '10px 12px', fontWeight: 500, color: 'var(--text3)', fontSize: 11 }}>Event</th>
                  <th style={{ textAlign: 'left', padding: '10px 12px', fontWeight: 500, color: 'var(--text3)', fontSize: 11 }}>Driver</th>
                  <th style={{ textAlign: 'left', padding: '10px 12px', fontWeight: 500, color: 'var(--text3)', fontSize: 11 }}>Description</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => {
                  const color = EVENT_COLORS[e.eventType] || 'var(--text3)';
                  const driverName = e.driverId?.fullName || '—';
                  const employeeCode = e.driverId?.employeeCode || '';
                  const driverIdStr = typeof e.driverId === 'object' ? e.driverId?._id : e.driverId;
                  return (
                    <tr
                      key={e._id}
                      style={{ borderBottom: '1px solid var(--border)' }}
                    >
                      <td style={{ padding: '10px 12px', color: 'var(--text2)', whiteSpace: 'nowrap' }}>
                        {formatDateTime(e.createdAt)}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Avatar initials={getInitials(e.performedByName)} size={22} />
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontSize: 12, fontWeight: 500 }}>{e.performedByName || 'Unknown'}</span>
                            {e.performedBy?.email && (
                              <span style={{ fontSize: 10, color: 'var(--text3)' }}>{e.performedBy.email}</span>
                            )}
                            {e.performedByRole && (
                              <span style={{ fontSize: 10, color: 'var(--accent)' }}>{e.performedByRole}</span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          borderRadius: 9999,
                          fontSize: 11,
                          fontWeight: 500,
                          background: 'var(--surface2)',
                          border: `1px solid ${color}`,
                          color,
                        }}>
                          {e.eventType?.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        {driverIdStr ? (
                          <button
                            onClick={() => navigate(`/drivers?driverId=${driverIdStr}`)}
                            style={{
                              background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                              color: 'var(--accent)', fontSize: 12, textAlign: 'left',
                            }}
                          >
                            {employeeCode ? `${employeeCode} · ` : ''}{driverName}
                          </button>
                        ) : '—'}
                      </td>
                      <td style={{ padding: '10px 12px', color: 'var(--text2)' }}>
                        <div>{e.description}</div>
                        {e.eventType === 'field_updated' && e.oldValue && e.newValue && (
                          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
                            <span style={{ textDecoration: 'line-through', color: '#f87171' }}>{e.oldValue}</span>
                            {' → '}
                            <span style={{ color: '#4ade80' }}>{e.newValue}</span>
                          </div>
                        )}
                        {e.reason && (
                          <div style={{ fontSize: 11, color: 'var(--text3)', fontStyle: 'italic', marginTop: 2 }}>
                            Reason: {e.reason}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {total > limit && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 14px', borderTop: '1px solid var(--border)', fontSize: 12, color: 'var(--text3)',
          }}>
            <span>
              Page {page} of {totalPages}
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                style={{
                  padding: '5px 12px', borderRadius: 6,
                  border: '1px solid var(--border2)', background: 'var(--surface2)',
                  color: page === 1 ? 'var(--text3)' : 'var(--text)',
                  cursor: page === 1 ? 'default' : 'pointer',
                  opacity: page === 1 ? 0.5 : 1, fontSize: 12,
                }}
              >
                ← Previous
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                style={{
                  padding: '5px 12px', borderRadius: 6,
                  border: '1px solid var(--border2)', background: 'var(--surface2)',
                  color: page >= totalPages ? 'var(--text3)' : 'var(--text)',
                  cursor: page >= totalPages ? 'default' : 'pointer',
                  opacity: page >= totalPages ? 0.5 : 1, fontSize: 12,
                }}
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
};

export default ActivityLog;
