import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getNotifications, markAsRead, markAllAsRead } from '../api/notificationsApi';

const typeColors = {
  attendance_uploaded: '#3b82f6',
  attendance_fully_approved: '#22c55e',
  attendance_disputed: '#ef4444',
  dispute_responded: '#f59e0b',
  invoice_generated: '#a855f7',
};

const typeLabels = {
  attendance_uploaded: 'Attendance',
  attendance_approved: 'Attendance',
  attendance_fully_approved: 'Attendance',
  attendance_disputed: 'Attendance',
  dispute_responded: 'Attendance',
  invoice_generated: 'Invoices',
};

const filters = [
  { key: 'all', label: 'All' },
  { key: 'unread', label: 'Unread' },
  { key: 'attendance', label: 'Attendance' },
  { key: 'invoices', label: 'Invoices' },
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
  return null;
}

const Notifications = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState('all');

  const { data, isLoading } = useQuery({
    queryKey: ['notifications-page', page],
    queryFn: () => getNotifications(page).then(r => r.data),
  });

  const allNotifications = data?.notifications || [];
  const total = data?.total || 0;

  const filtered = allNotifications.filter((n) => {
    if (filter === 'unread') return !n.isRead;
    if (filter === 'attendance') return (typeLabels[n.type] || '') === 'Attendance';
    if (filter === 'invoices') return (typeLabels[n.type] || '') === 'Invoices';
    return true;
  });

  const handleMarkRead = async (id) => {
    await markAsRead(id);
    queryClient.invalidateQueries({ queryKey: ['notifications-page'] });
    queryClient.invalidateQueries({ queryKey: ['notif-unread-count'] });
  };

  const handleMarkAllRead = async () => {
    await markAllAsRead();
    queryClient.invalidateQueries({ queryKey: ['notifications-page'] });
    queryClient.invalidateQueries({ queryKey: ['notif-unread-count'] });
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
          style={{
            background: 'none',
            border: '1px solid var(--border2)',
            borderRadius: 8,
            padding: '6px 14px',
            fontSize: 12,
            color: 'var(--accent)',
            cursor: 'pointer',
          }}
        >
          Mark all as read
        </button>
      </div>

      {/* Filter pills */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {filters.map((f) => (
          <button key={f.key} onClick={() => setFilter(f.key)} style={pillStyle(filter === f.key)}>
            {f.label}
          </button>
        ))}
      </div>

      {/* List */}
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        overflow: 'hidden',
      }}>
        {isLoading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
            Loading...
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
            No notifications
          </div>
        ) : (
          filtered.map((n) => {
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
                    style={{
                      background: 'none',
                      border: '1px solid var(--border2)',
                      borderRadius: 6,
                      padding: '4px 10px',
                      fontSize: 11,
                      color: 'var(--text3)',
                      cursor: 'pointer',
                      flexShrink: 0,
                      marginTop: 2,
                    }}
                  >
                    Mark read
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
            style={{
              background: 'none',
              border: '1px solid var(--border2)',
              borderRadius: 8,
              padding: '8px 24px',
              fontSize: 12,
              color: 'var(--accent)',
              cursor: 'pointer',
            }}
          >
            Load more
          </button>
        </div>
      )}
    </div>
  );
};

export default Notifications;
