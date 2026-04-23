import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import Card from '../components/ui/Card';
import Avatar from '../components/ui/Avatar';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import {
  getActivityLog,
  getActivityLogUsers,
  getActivityLogEntityTypes,
} from '../api/activityLogApi';

const METHOD_COLORS = {
  POST: '#4ade80',
  PUT: '#fbbf24',
  PATCH: '#fbbf24',
  DELETE: '#f87171',
};

const SOURCE_LABELS = {
  driver_history: 'Driver',
  audit_log: 'System',
};

const getInitials = (name, email) => {
  if (name) return name.trim().split(/\s+/).map((n) => n[0]).join('').toUpperCase().slice(0, 2);
  if (email) return email.trim()[0].toUpperCase();
  return '?';
};

// Some legacy records store the literal string "Unknown" as the user role —
// treat it as "no role" so the column doesn't flag it as real data.
const cleanRole = (role) => {
  if (!role) return null;
  const trimmed = String(role).trim();
  if (!trimmed || trimmed.toLowerCase() === 'unknown') return null;
  return trimmed;
};

const formatDateTime = (d) => {
  if (!d) return '';
  const date = new Date(d);
  if (isNaN(date)) return '';
  return date.toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
};

const ActivityLog = () => {
  const [userId, setUserId] = useState('');
  const [entityType, setEntityType] = useState('');
  const [action, setAction] = useState('');
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

  const { data: entityTypesData } = useQuery({
    queryKey: ['activity-log-entity-types'],
    queryFn: () => getActivityLogEntityTypes(),
    staleTime: 5 * 60 * 1000,
  });
  const entityTypes = entityTypesData?.data || [];

  const filters = { page, limit };
  if (userId) filters.userId = userId;
  if (entityType) filters.entityType = entityType;
  if (action) filters.action = action;
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
    setEntityType('');
    setAction('');
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
          System-wide log of every mutating action — who did what, across all modules.
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
            <label style={{ fontSize: 11, color: 'var(--text3)' }}>Module</label>
            <select
              value={entityType}
              onChange={(e) => { setEntityType(e.target.value); setPage(1); }}
              style={inputStyle}
            >
              <option value="">All modules</option>
              {entityTypes.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, color: 'var(--text3)' }}>Action</label>
            <input
              type="text"
              value={action}
              placeholder="e.g. drivers.update"
              onChange={(e) => { setAction(e.target.value); setPage(1); }}
              style={{ ...inputStyle, minWidth: 170 }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, color: 'var(--text3)' }}>From</label>
            <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} style={inputStyle} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, color: 'var(--text3)' }}>To</label>
            <input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} style={inputStyle} />
          </div>

          <button
            onClick={resetFilters}
            style={{
              padding: '7px 14px', borderRadius: 6, border: '1px solid var(--border2)',
              background: 'transparent', color: 'var(--text2)', fontSize: 12, cursor: 'pointer',
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
                  <th style={{ textAlign: 'left', padding: '10px 12px', fontWeight: 500, color: 'var(--text3)', fontSize: 11 }}>Action</th>
                  <th style={{ textAlign: 'left', padding: '10px 12px', fontWeight: 500, color: 'var(--text3)', fontSize: 11 }}>Module</th>
                  <th style={{ textAlign: 'left', padding: '10px 12px', fontWeight: 500, color: 'var(--text3)', fontSize: 11 }}>Description</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => {
                  const sourceLabel = SOURCE_LABELS[e.source] || e.source;
                  const methodColor = e.method ? METHOD_COLORS[e.method] : null;
                  const displayRole = cleanRole(e.userRole);
                  const hasUser = Boolean(e.userName || e.userEmail);
                  const primaryLabel = e.userName || e.userEmail || 'System';
                  return (
                    <tr key={e._id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '10px 12px', color: 'var(--text2)', whiteSpace: 'nowrap', fontSize: 11 }}>
                        {formatDateTime(e.timestamp)}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Avatar initials={getInitials(e.userName, e.userEmail)} size={22} />
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontSize: 12, fontWeight: 500 }}>{primaryLabel}</span>
                            {e.userName && e.userEmail && (
                              <span style={{ fontSize: 10, color: 'var(--text3)' }}>{e.userEmail}</span>
                            )}
                            {displayRole && (
                              <span style={{ fontSize: 10, color: 'var(--accent)' }}>{displayRole}</span>
                            )}
                            {!hasUser && (
                              <span style={{ fontSize: 10, color: 'var(--text3)' }}>Automated / system</span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <span style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--text2)' }}>
                            {e.action}
                          </span>
                          {e.method && (
                            <span style={{
                              fontSize: 10, fontWeight: 600, color: methodColor,
                              fontFamily: 'monospace',
                            }}>
                              {e.method}
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{
                          display: 'inline-block', padding: '2px 8px', borderRadius: 9999,
                          fontSize: 11, fontWeight: 500,
                          background: 'var(--surface2)',
                          border: '1px solid var(--border)',
                          color: 'var(--text2)',
                        }}>
                          {e.entityType || '—'}
                        </span>
                        <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>
                          {sourceLabel}
                          {e.entityLabel ? ` · ${e.entityLabel}` : ''}
                        </div>
                      </td>
                      <td style={{ padding: '10px 12px', color: 'var(--text2)', fontSize: 12 }}>
                        <div>{e.description}</div>
                        {e.oldValue && e.newValue && (
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
                        {e.ip && (
                          <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>
                            IP: {e.ip}
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
            <span>Page {page} of {totalPages}</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                style={{
                  padding: '5px 12px', borderRadius: 6, border: '1px solid var(--border2)',
                  background: 'var(--surface2)',
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
                  padding: '5px 12px', borderRadius: 6, border: '1px solid var(--border2)',
                  background: 'var(--surface2)',
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
