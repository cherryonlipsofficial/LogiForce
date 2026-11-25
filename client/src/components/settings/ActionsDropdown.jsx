import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';
import PermissionGate from '../ui/PermissionGate';
import { sendPasswordResetEmail } from '../../api/usersApi';

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
  user, onEdit, onPermissions, onDeactivate, onActivate, currentUserId, onClose, anchorRef,
}) {
  const ref = useRef(null);
  const [pos, setPos] = useState(null);
  const [resetting, setResetting] = useState(false);

  const handleResetPassword = async () => {
    if (resetting) return;
    setResetting(true);
    const toastId = toast.loading(`Sending reset email to ${user.email}...`);
    try {
      const res = await sendPasswordResetEmail(user._id);
      toast.success(res?.message || `Password reset email sent to ${user.email}`, { id: toastId });
      onClose();
    } catch (err) {
      const msg = err?.response?.data?.message || err.message || 'Failed to send reset email';
      toast.error(msg, { id: toastId });
    } finally {
      setResetting(false);
    }
  };

  // Compute fixed-position coordinates from the anchor (trigger button)
  useLayoutEffect(() => {
    const compute = () => {
      const anchor = anchorRef?.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const width = 180;
      const left = Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8));
      setPos({ top: rect.bottom + 4, left });
    };
    compute();
    window.addEventListener('resize', compute);
    window.addEventListener('scroll', compute, true);
    return () => {
      window.removeEventListener('resize', compute);
      window.removeEventListener('scroll', compute, true);
    };
  }, [anchorRef]);

  // Close on click outside (ignore clicks on the anchor — it owns toggle)
  useEffect(() => {
    const handler = (e) => {
      if (ref.current && ref.current.contains(e.target)) return;
      if (anchorRef?.current && anchorRef.current.contains(e.target)) return;
      onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose, anchorRef]);

  const handleItem = (fn) => {
    fn();
    onClose();
  };

  const isSelf = user._id === currentUserId;
  const isPending = !user.isActive && !user.activatedAt;
  const isDeactivated = !user.isActive && !!user.activatedAt;

  if (!pos) return null;

  return createPortal(
    <div
      ref={ref}
      style={{
        position: 'fixed',
        top: pos.top,
        left: pos.left,
        width: 180,
        background: 'var(--surface2)',
        border: '1px solid var(--border2)',
        borderRadius: 10,
        overflow: 'hidden',
        zIndex: 1000,
        boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
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

      <PermissionGate permission="users.manage_access">
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
        style={{ ...itemStyle, opacity: resetting ? 0.6 : 1, cursor: resetting ? 'wait' : 'pointer' }}
        disabled={resetting}
        onClick={handleResetPassword}
        onMouseEnter={e => { if (!resetting) { e.currentTarget.style.background = 'var(--surface3)'; e.currentTarget.style.color = 'var(--text)'; } }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text2)'; }}
      >
        {resetting ? 'Sending...' : 'Reset password'}
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
    </div>,
    document.body,
  );
}
