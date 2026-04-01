import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getNotifications, markAsRead, markAllAsRead, getPendingApprovals } from '../api/notificationsApi';

const typeColors = {
  attendance_uploaded: '#3b82f6',
  attendance_approved: '#3b82f6',
  attendance_fully_approved: '#22c55e',
  attendance_disputed: '#ef4444',
  dispute_responded: '#f59e0b',
  invoice_generated: '#a855f7',
  salary_run_ready: '#3b82f6',
  advance_requested: '#f59e0b',
  advance_approved: '#22c55e',
  advance_rejected: '#ef4444',
  salary_ops_approved: '#3b82f6',
  salary_compliance_approved: '#3b82f6',
  salary_accounts_approved: '#22c55e',
  salary_processed: '#22c55e',
  salary_approval_reminder: '#f59e0b',
  credit_note_created: '#a855f7',
  credit_note_sent: '#3b82f6',
  credit_note_adjusted: '#f59e0b',
  credit_note_settled: '#22c55e',
};

const filters = [
  { key: 'all', label: 'All' },
  { key: 'unread', label: 'Unread' },
  { key: 'attendance', label: 'Attendance' },
  { key: 'invoices', label: 'Invoices' },
  { key: 'salary', label: 'Salary' },
  { key: 'advances', label: 'Advances' },
  { key: 'credit_notes', label: 'Credit Notes' },
];

function formatRelativeTime(dateStr) {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function getNavigationPath(notification) {
  const { referenceModel } = notification;
  if (referenceModel === 'AttendanceBatch' || referenceModel === 'AttendanceRecord') {
    return '/attendance';
  }
  if (referenceModel === 'Invoice') {
    return '/invoices';
  }
  if (referenceModel === 'SalaryRun' || referenceModel === 'Project') {
    return '/salary';
  }
  if (referenceModel === 'Advance') {
    return '/advances';
  }
  if (referenceModel === 'CreditNote') {
    return '/credit-notes';
  }
  return null;
}

function getFilterParams(filter) {
  if (filter === 'unread') return { filter: 'unread' };
  if (filter === 'all') return {};
  return { type: filter };
}

const Notifications = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState('all');
  const [markingAll, setMarkingAll] = useState(false);
  const [markingId, setMarkingId] = useState(null);
  const [allNotifications, setAllNotifications] = useState([]);

  const filterParams = getFilterParams(filter);

  const { data, isLoading } = useQuery({
    queryKey: ['notifications-page', page, filter],
    queryFn: () => getNotifications(page, filterParams).then(r => r.data),
  });

  // Accumulate notifications across pages; reset when filter changes
  useEffect(() => {
    if (!data?.notifications) return;
    if (page === 1) {
      setAllNotifications(data.notifications);
    } else {
      setAllNotifications(prev => {
        const existingIds = new Set(prev.map(n => n._id));
        const newItems = data.notifications.filter(n => !existingIds.has(n._id));
        return [...prev, ...newItems];
      });
    }
  }, [data, page]);

  // Reset to page 1 when filter changes
  const handleFilterChange = useCallback((key) => {
    setFilter(key);
    setPage(1);
    setAllNotifications([]);
  }, []);

  const { data: pendingApprovalsData } = useQuery({
    queryKey: ['pending-approvals'],
    queryFn: () => getPendingApprovals().then(r => r.data?.data || r.data || {}),
    refetchInterval: 60 * 1000,
  });
  const pendingItems = pendingApprovalsData?.items || [];
  const pendingTotal = pendingApprovalsData?.total || 0;

  const total = data?.total || 0;

  const handleMarkRead = async (id) => {
    if (markingId) return;
    setMarkingId(id);
    try {
      await markAsRead(id);
      setAllNotifications(prev => prev.map(n => n._id === id ? { ...n, isRead: true, readAt: new Date().toISOString() } : n));
      queryClient.invalidateQueries({ queryKey: ['notifications-page'] });
      queryClient.invalidateQueries({ queryKey: ['notif-unread-count'] });
    } finally {
      setMarkingId(null);
    }
  };

  const handleMarkAllRead = async () => {
    if (markingAll) return;
    setMarkingAll(true);
    try {
      await markAllAsRead();
      setAllNotifications(prev => prev.map(n => ({ ...n, isRead: true, readAt: new Date().toISOString() })));
      queryClient.invalidateQueries({ queryKey: ['notifications-page'] });
      queryClient.invalidateQueries({ queryKey: ['notif-unread-count'] });
    } finally {
      setMarkingAll(false);
    }
  };

  const pillStyle = (active) => ({
    padding: '5px 14px',
    borderRadius: 20,
    border: '1px solid ' + (active ? 'var(--accent)' : 'var(--border2)'),
    background: active ? 'rgba(79,142,247,0.12)' : 'transparent',
    color: active ? 'var(--accent)' : 'var(--text2)',
    fontSize: 12,
    fontWeight: active ? 500 : 400,
    cursor: 'pointer',
  });

  return (
    <div style={{ padding: '0 24px 24px' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 20,
      }}>
        <h2 style={{ fontSize: 18, fontWeight: 500, margin: 0 }}>Notifications</h2>
        <button
          onClick={handleMarkAllRead}
          disabled={markingAll}
          style={{
            background: 'none',
            border: '1px solid var(--border2)',
            borderRadius: 8,
            padding: '6px 14px',
            fontSize: 12,
            color: 'var(--accent)',
            cursor: markingAll ? 'not-allowed' : 'pointer',
            opacity: markingAll ? 0.5 : 1,
          }}
        >
          {markingAll ? 'Marking...' : 'Mark all as read'}
        </button>
      </div>

      {/* Filter pills */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {filters.map((f) => (
          <button key={f.key} onClick={() => handleFilterChange(f.key)} style={pillStyle(filter === f.key)}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Pending Approvals */}
      {pendingTotal > 0 && (
        <div style={{
          background: 'rgba(245,158,11,0.06)',
          border: '1px solid rgba(245,158,11,0.25)',
          borderRadius: 12,
          padding: '14px 20px',
          marginBottom: 16,
        }}>
          <div style={{
            fontSize: 13,
            fontWeight: 600,
            color: '#d97706',
            marginBottom: 8,
          }}>
            {pendingTotal} pending approval{pendingTotal !== 1 ? 's' : ''}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {pendingItems.map((item) => (
              <div
                key={item.type}
                onClick={() => navigate(item.path)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '6px 10px',
                  borderRadius: 6,
                  fontSize: 12,
                  color: 'var(--text2)',
                  cursor: 'pointer',
                  transition: 'background .1s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(245,158,11,0.10)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <span>{item.label}</span>
                <span style={{
                  background: '#f59e0b',
                  color: '#78350f',
                  borderRadius: 10,
                  fontSize: 10,
                  padding: '1px 6px',
                  lineHeight: '16px',
                  fontWeight: 600,
                  minWidth: 18,
                  textAlign: 'center',
                }}>
                  {item.count}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* List */}
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        overflow: 'hidden',
      }}>
        {isLoading && page === 1 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
            Loading...
          </div>
        ) : allNotifications.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
            No notifications
          </div>
        ) : (
          allNotifications.map((n) => {
            const dotColor = typeColors[n.type] || '#6b7280';
            const isUnread = !n.isRead;

            return (
              <div
                key={n._id}
                style={{
                  padding: '14px 20px',
                  borderBottom: '1px solid var(--border)',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 12,
                  background: isUnread ? 'rgba(79,142,247,0.04)' : 'transparent',
                  cursor: 'pointer',
                  transition: 'background .1s',
                }}
                onClick={() => {
                  handleMarkRead(n._id);
                  const path = getNavigationPath(n);
                  if (path) navigate(path);
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface2)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = isUnread ? 'rgba(79,142,247,0.04)' : 'transparent')}
              >
                {/* Color dot */}
                <div style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: dotColor,
                  marginTop: 5,
                  flexShrink: 0,
                }} />

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: isUnread ? 'var(--text)' : 'var(--text3)',
                  }}>
                    {n.title}
                  </div>
                  <div style={{
                    fontSize: 12,
                    color: 'var(--text3)',
                    marginTop: 3,
                    overflow: 'hidden',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    whiteSpace: 'normal',
                    lineHeight: '17px',
                  }}>
                    {n.message}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
                    {formatRelativeTime(n.createdAt)}
                  </div>
                </div>

                {/* Mark read button */}
                {isUnread && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleMarkRead(n._id); }}
                    disabled={markingId === n._id}
                    style={{
                      background: 'none',
                      border: '1px solid var(--border2)',
                      borderRadius: 6,
                      padding: '4px 10px',
                      fontSize: 11,
                      color: 'var(--text3)',
                      cursor: markingId === n._id ? 'not-allowed' : 'pointer',
                      opacity: markingId === n._id ? 0.5 : 1,
                      flexShrink: 0,
                      marginTop: 2,
                    }}
                  >
                    {markingId === n._id ? 'Marking...' : 'Mark read'}
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Load more */}
      {total > allNotifications.length && (
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <button
            onClick={() => setPage(p => p + 1)}
            disabled={isLoading}
            style={{
              background: 'none',
              border: '1px solid var(--border2)',
              borderRadius: 8,
              padding: '8px 24px',
              fontSize: 12,
              color: 'var(--accent)',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              opacity: isLoading ? 0.5 : 1,
            }}
          >
            {isLoading ? 'Loading...' : 'Load more'}
          </button>
        </div>
      )}
    </div>
  );
};

export default Notifications;
