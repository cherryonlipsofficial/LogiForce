import { useNavigate } from 'react-router-dom';

const typeColors = {
  attendance_uploaded: '#3b82f6',
  attendance_fully_approved: '#22c55e',
  attendance_disputed: '#ef4444',
  dispute_responded: '#f59e0b',
  invoice_generated: '#a855f7',
  advance_requested: '#f59e0b',
  advance_approved: '#22c55e',
  advance_rejected: '#ef4444',
};

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
  const { referenceModel, referenceId } = notification;
  if (referenceModel === 'AttendanceBatch' || referenceModel === 'AttendanceRecord') {
    return '/attendance';
  }
  if (referenceModel === 'Invoice') {
    return '/invoices';
  }
  if (referenceModel === 'Advance') {
    return '/advances';
  }
  return null;
}

const SkeletonRow = () => (
  <div style={{ padding: '12px 16px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
    <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--surface3)', marginTop: 4, flexShrink: 0 }} />
    <div style={{ flex: 1 }}>
      <div style={{ height: 12, width: '60%', background: 'var(--surface3)', borderRadius: 4, marginBottom: 6 }} />
      <div style={{ height: 10, width: '90%', background: 'var(--surface3)', borderRadius: 4, marginBottom: 4 }} />
      <div style={{ height: 9, width: '30%', background: 'var(--surface3)', borderRadius: 4 }} />
    </div>
  </div>
);

const NotificationPanel = ({ notifications, isLoading, unreadCount, onClose, onMarkAllRead, onMarkRead }) => {
  const navigate = useNavigate();

  return (
    <div
      className="notif-panel-container"
      style={{
        position: 'absolute',
        top: 'calc(100% + 8px)',
        right: 0,
        width: 380,
        maxHeight: 480,
        background: 'var(--surface)',
        border: '1px solid var(--border2)',
        borderRadius: 12,
        overflow: 'hidden',
        zIndex: 200,
        boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
        animation: 'fadeIn .12s ease',
      }}
    >
      {/* Header */}
      <div style={{
        padding: '12px 16px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)' }}>Notifications</span>
        {unreadCount > 0 && (
          <button
            onClick={onMarkAllRead}
            style={{
              background: 'none',
              border: 'none',
              fontSize: 11,
              color: 'var(--accent)',
              cursor: 'pointer',
              padding: '2px 4px',
            }}
          >
            Mark all read
          </button>
        )}
      </div>

      {/* Body */}
      <div style={{ overflowY: 'auto', maxHeight: 380 }}>
        {isLoading ? (
          <>
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </>
        ) : notifications.length === 0 ? (
          <div style={{
            padding: '40px 16px',
            textAlign: 'center',
            fontSize: 13,
            color: 'var(--text3)',
          }}>
            No notifications yet
          </div>
        ) : (
          notifications.map((n) => {
            const dotColor = typeColors[n.type] || '#6b7280';
            const isUnread = !n.isRead;

            return (
              <div
                key={n._id}
                onClick={() => {
                  onMarkRead(n._id);
                  const path = getNavigationPath(n);
                  if (path) navigate(path);
                  onClose();
                }}
                style={{
                  padding: '12px 16px',
                  borderBottom: '1px solid var(--border)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                  background: isUnread ? 'rgba(79,142,247,0.04)' : 'transparent',
                  transition: 'background .1s',
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
                  marginTop: 4,
                  flexShrink: 0,
                }} />

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 12,
                    fontWeight: 500,
                    color: isUnread ? 'var(--text)' : 'var(--text3)',
                  }}>
                    {n.title}
                  </div>
                  <div style={{
                    fontSize: 11,
                    color: 'var(--text3)',
                    marginTop: 2,
                    overflow: 'hidden',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    whiteSpace: 'normal',
                    lineHeight: '15px',
                  }}>
                    {n.message}
                  </div>
                  <div style={{
                    fontSize: 10,
                    color: 'var(--text3)',
                    marginTop: 3,
                  }}>
                    {formatRelativeTime(n.createdAt)}
                  </div>
                </div>

                {/* Unread indicator */}
                {isUnread && (
                  <div style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: '#3b82f6',
                    marginTop: 6,
                    flexShrink: 0,
                  }} />
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div style={{
        padding: '10px 16px',
        borderTop: '1px solid var(--border)',
        textAlign: 'center',
      }}>
        <button
          onClick={() => { navigate('/notifications'); onClose(); }}
          style={{
            background: 'none',
            border: 'none',
            fontSize: 12,
            color: 'var(--accent)',
            cursor: 'pointer',
          }}
        >
          View all notifications →
        </button>
      </div>
    </div>
  );
};

export default NotificationPanel;
