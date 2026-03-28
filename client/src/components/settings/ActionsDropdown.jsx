import { useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import PermissionGate from '../ui/PermissionGate';

const itemStyle = {
  padding: '9px 14px',
  fontSize: 12,
  cursor: 'pointer',
  color: 'var(--text2)',
  background: 'transparent',
  border: 'none',
  width: '100%',
  textAlign: 'left',
  transition: 'background 0.1s',
  display: 'block',
};

const dividerStyle = {
  height: 1,
  background: 'var(--border)',
  margin: '4px 0',
};

export default function ActionsDropdown({
  user, onEdit, onPermissions, onDeactivate, onActivate, currentUserId, onClose,
}) {
  const ref = useRef(null);

  // Close on click outside
  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const handleItem = (fn) => {
    fn();
    onClose();
  };

  const isSelf = user._id === currentUserId;
  const isPending = !user.isActive && !user.activatedAt;
  const isDeactivated = !user.isActive && !!user.activatedAt;

  return (
    <div
      ref={ref}
      style={{
        position: 'absolute',
        right: 0,
        top: '100%',
        width: 180,
        background: 'var(--surface2)',
        border: '1px solid var(--border2)',
        borderRadius: 10,
        overflow: 'hidden',
        zIndex: 50,
      }}
    >
      <PermissionGate permission="users.edit">
        <button
          style={itemStyle}
          onClick={() => handleItem(onEdit)}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface3)'; e.currentTarget.style.color = 'var(--text)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text2)'; }}
        >
          Edit user
        </button>
      </PermissionGate>

      <PermissionGate permission="roles.manage">
        <button
          style={itemStyle}
          onClick={() => handleItem(onPermissions)}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface3)'; e.currentTarget.style.color = 'var(--text)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text2)'; }}
        >
          Manage permissions
        </button>
      </PermissionGate>

      <div style={dividerStyle} />

      <PermissionGate permission="users.edit">
        <button
          style={itemStyle}
          onClick={() => handleItem(onEdit)}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface3)'; e.currentTarget.style.color = 'var(--text)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text2)'; }}
        >
          Change role
        </button>
      </PermissionGate>

      <button
        style={itemStyle}
        onClick={() => {
          toast.info(`Password reset email sent to ${user.email}`);
          onClose();
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface3)'; e.currentTarget.style.color = 'var(--text)'; }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text2)'; }}
      >
        Reset password
      </button>

      {!isSelf && (
        <>
          <div style={dividerStyle} />
          <PermissionGate permission="users.edit">
            {/* Show activate for pending/deactivated users, deactivate for active users */}
            {!user.isActive ? (
              <button
                style={{
                  ...itemStyle,
                  color: '#4ade80',
                }}
                onClick={() => handleItem(onActivate || (() => {}))}
                onMouseEnter={e => {
                  e.currentTarget.style.background = 'rgba(34,197,94,0.08)';
                }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
              >
                {isPending ? '\u2713 Activate account' : 'Activate account'}
              </button>
            ) : (
              <button
                style={{
                  ...itemStyle,
                  color: '#f87171',
                }}
                onClick={() => handleItem(onDeactivate)}
                onMouseEnter={e => {
                  e.currentTarget.style.background = 'rgba(239,68,68,0.08)';
                }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
              >
                Deactivate
              </button>
            )}
          </PermissionGate>
        </>
      )}
    </div>
  );
}
